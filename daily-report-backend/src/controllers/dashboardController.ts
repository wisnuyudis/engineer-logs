import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/authMiddleware';

const prisma = new PrismaClient();

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
    const pipelineValue = allActivities.reduce((acc, curr) => acc + (curr.prospectValue || 0), 0);
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
