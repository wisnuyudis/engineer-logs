import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/authMiddleware';
import { canManageUserKpi } from '../utils/kpiManual';
import { fetchUpcomingJiraScheduleByAssignee } from '../services/jiraService';

const prisma = new PrismaClient();

const pipelineUpdatedAt = (activity: { updatedAt?: Date; createdAt?: Date; date?: string }) => {
  const raw = activity.updatedAt || activity.createdAt || activity.date || '';
  const timestamp = new Date(raw).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const uniquePipelineValue = (activities: Array<{
  id: string;
  leadId?: string | null;
  prospectValue?: number | null;
  updatedAt?: Date;
  createdAt?: Date;
  date?: string;
  actKey?: string;
  topic?: string | null;
}>) => {
  const latestByLead = new Map<string, { value: number; updatedAt: number }>();

  for (const activity of activities) {
    if (activity.prospectValue === null || activity.prospectValue === undefined) continue;
    const value = Number(activity.prospectValue);
    if (Number.isNaN(value)) continue;

    const leadId = String(activity.leadId || '').trim().toLowerCase();
    const key = leadId || activity.id || `${activity.date}-${activity.actKey}-${activity.topic || ''}`;
    const updatedAt = pipelineUpdatedAt(activity);
    const current = latestByLead.get(key);
    if (!current || updatedAt >= current.updatedAt) {
      latestByLead.set(key, { value, updatedAt });
    }
  }

  return Array.from(latestByLead.values()).reduce((sum, item) => sum + item.value, 0);
};

export const getMetrics = async (req: AuthRequest, res: Response) => {
  try {
    const { team } = req.query; // optional filter
    
    // Base filter depending on requester role (admin sees all, others see own team)
    const userRole = req.user?.role;
    const userTeam = req.user?.team;
    
    let userFilter = {};
    if (userRole !== 'admin' && userRole !== 'manager' && userTeam !== 'all') {
      userFilter = { user: { team: userTeam } };
    }
    
    // Note: if user is SE, they only see their own? Let's keep metrics aggregate for team wide
    // Or just all activities if they are filtering team.
    
    // Simplification for prototype: return overall total hours, tasks
    const allActivities = await prisma.activity.findMany();
    
    const totalHours = allActivities.reduce((acc, curr) => acc + (curr.dur / 60), 0);
    const totalActivities = allActivities.length;
    const pipelineValue = uniquePipelineValue(allActivities);
    const avgNpsCount = allActivities.filter(a => a.nps !== null && a.nps !== undefined);
    const avgNps = avgNpsCount.length 
      ? avgNpsCount.reduce((acc, curr) => acc + (curr.nps || 0), 0) / avgNpsCount.length 
      : 0;

    res.json({
      totalHours: parseFloat(totalHours.toFixed(1)),
      totalActivities,
      pipelineValue,
      avgNps: parseFloat(avgNps.toFixed(1))
    });

  } catch (error) {
    if(req.log) req.log.error(error, 'Metrics fetch failed');
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
};

export const getLeaderboard = async (req: AuthRequest, res: Response) => {
  try {
    const allUsers = await prisma.user.findMany({
      select: { id: true, name: true, team: true, role: true, avatarUrl: true }
    });
    
    const allActivities = await prisma.activity.findMany({
      include: { user: true }
    });

    const leaderboard = allUsers.map(user => {
      const userActs = allActivities.filter(a => a.userId === user.id);
      const totalDur = userActs.reduce((acc, curr) => acc + curr.dur, 0);
      const completed = userActs.filter(a => a.status === 'completed').length;
      const efficiency = userActs.length ? Math.round((completed / userActs.length) * 100) : 0;
      
      return {
        id: user.id,
        name: user.name,
        role: user.role,
        team: user.team,
        avatar: user.avatarUrl,
        totalHours: parseFloat((totalDur / 60).toFixed(1)),
        activitiesCount: userActs.length,
        efficiency
      };
    }).sort((a, b) => b.totalHours - a.totalHours);

    res.json(leaderboard.slice(0, 5)); // top 5
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
};

export const getUpcomingJiraSchedule = async (req: AuthRequest, res: Response) => {
  try {
    const actorId = req.user?.userId;
    const targetUserId = String(req.params.userId || '');
    if (!actorId) return res.status(401).json({ error: 'Unauthorized' });
    if (!targetUserId) return res.status(400).json({ error: 'User target wajib diisi' });

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        name: true,
        role: true,
        team: true,
        jiraAccountId: true,
      },
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }

    const isSelf = actorId === targetUser.id;
    const allowed = isSelf || canManageUserKpi(req.user || {}, targetUser);
    if (!allowed) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    if (String(targetUser.team || '') !== 'delivery') {
      return res.status(400).json({ error: 'Section Jira schedule hanya tersedia untuk user delivery' });
    }

    if (!targetUser.jiraAccountId) {
      return res.json({
        user: {
          id: targetUser.id,
          name: targetUser.name,
          jiraAccountId: null,
        },
        items: [],
        missingJiraAccount: true,
      });
    }

    const items = await fetchUpcomingJiraScheduleByAssignee(targetUser.jiraAccountId, 15);

    return res.json({
      user: {
        id: targetUser.id,
        name: targetUser.name,
        jiraAccountId: targetUser.jiraAccountId,
      },
      items,
      missingJiraAccount: false,
    });
  } catch (error) {
    if (req.log) req.log.error(error, 'Upcoming Jira schedule fetch failed');
    return res.status(500).json({ error: 'Failed to fetch upcoming Jira schedule' });
  }
};
