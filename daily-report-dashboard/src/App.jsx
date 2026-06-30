import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sidebar } from './components/Sidebar';
import { LoginPage } from './components/LoginPage';
import { DashboardView } from './components/DashboardView';
import { ActivitiesView } from './components/ActivitiesView';
import { MembersView } from './components/MembersView';
import { ReportsView } from './components/ReportsView';
import { KpiReportView } from './components/KpiReportView';
import { NpsReportView } from './components/NpsReportView';
import { ExecutiveReportView } from './components/ExecutiveReportView';
import { JobReportView } from './components/JobReportView';
import { ProfileView } from './components/ProfileView';
import { TaxonomyView } from './components/TaxonomyView';
import { CustomersView } from './components/CustomersView';
import { KpiManagementView } from './components/KpiManagementView';
import { KpiNpsView } from './components/KpiNpsView';
import { AuditTrailView } from './components/AuditTrailView';
import { SmtpSettingsView } from './components/SmtpSettingsView';
import { DocsView } from './components/DocsView';
import { MaintenancePage } from './components/MaintenancePage';
import { TaxonomyContext } from './contexts/TaxonomyContext';
import { T, FONT, DISPLAY, applyThemeTokens } from './theme/tokens';
import { RoleBadge, Avi, Btn } from './components/ui/Primitives';
import { Toaster } from 'sonner';
import React from 'react';
import api from './lib/api';
import { canViewJobReport, canViewKpiNps, isMgr } from './constants/taxonomy';

const SESSION_TIMEOUT_HOURS = Number(import.meta.env.VITE_SESSION_TIMEOUT_HOURS || 168);
const SESSION_TIMEOUT_MS = Math.max(1, Number.isFinite(SESSION_TIMEOUT_HOURS) ? SESSION_TIMEOUT_HOURS : 168) * 60 * 60 * 1000;
const LAST_ACTIVITY_KEY = 'last_activity_at';
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('user');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('theme') || 'dark';
    } catch {
      return 'dark';
    }
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 1024 : false));
  const [maintenanceEvent, setMaintenanceEvent] = useState(null);

  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  applyThemeTokens(theme);

  const syncUser = (nextUser) => {
    setUser(nextUser);
    localStorage.setItem('user', JSON.stringify(nextUser));
  };

  const clearAuthSession = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    queryClient.clear();
    setUser(null);
  };

  useEffect(() => {
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const onMaintenance = (event) => setMaintenanceEvent(event.detail || { enabled: true });
    window.addEventListener('maintenance:active', onMaintenance);
    return () => window.removeEventListener('maintenance:active', onMaintenance);
  }, []);

  const { data: maintenanceStatus, refetch: refetchMaintenance } = useQuery({
    queryKey: ['maintenance-status'],
    queryFn: async () => {
      const res = await api.get('/maintenance/status');
      return res.data;
    },
    refetchInterval: 60000,
  });

  useEffect(() => {
    if (maintenanceStatus?.enabled === false) {
      setMaintenanceEvent(null);
    }
  }, [maintenanceStatus]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname, isMobile]);

  useEffect(() => {
    const handleAuthUpdated = (event) => {
      const nextUser = event?.detail?.user;
      if (nextUser) {
        syncUser(nextUser);
      }
    };
    window.addEventListener('auth:updated', handleAuthUpdated);
    return () => window.removeEventListener('auth:updated', handleAuthUpdated);
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    if (!localStorage.getItem(LAST_ACTIVITY_KEY)) {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    }

    let timerId;
    let lastWriteAt = 0;

    const logoutIdleUser = () => {
      api.post('/auth/logout').catch(() => null).finally(() => {
        clearAuthSession();
        navigate('/');
      });
    };

    const scheduleIdleCheck = () => {
      window.clearTimeout(timerId);
      const lastActivityAt = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || Date.now());
      const remainingMs = Math.max(0, SESSION_TIMEOUT_MS - (Date.now() - lastActivityAt));
      timerId = window.setTimeout(() => {
        const latestActivityAt = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || 0);
        if (Date.now() - latestActivityAt >= SESSION_TIMEOUT_MS) {
          logoutIdleUser();
          return;
        }
        scheduleIdleCheck();
      }, remainingMs + 250);
    };

    const markActivity = () => {
      const now = Date.now();
      if (now - lastWriteAt < 30000) return;
      lastWriteAt = now;
      localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
      scheduleIdleCheck();
    };

    ACTIVITY_EVENTS.forEach((eventName) => window.addEventListener(eventName, markActivity, { passive: true }));
    scheduleIdleCheck();

    return () => {
      window.clearTimeout(timerId);
      ACTIVITY_EVENTS.forEach((eventName) => window.removeEventListener(eventName, markActivity));
    };
  }, [user, navigate, queryClient]);

  const { data: members = [], isLoading: loadingMembers } = useQuery({
    queryKey: ['members'],
    queryFn: async () => {
      const res = await api.get('/users');
      return res.data;
    },
    enabled: !!user
  });

  const { data: acts = [], isLoading: loadingActs } = useQuery({
    queryKey: ['activities'],
    queryFn: async () => {
      const res = await api.get('/activities', { params: { paginate: false } });
      return res.data.map(a => ({
        ...a,
        userId: a.user?.id,
        userName: a.user?.name,
        user: a.user?.name,
        userTeam: a.user?.team,
        kpi: { nps: a.nps }
      }));
    },
    enabled: !!user && location.pathname !== '/activities'
  });

  const { data: taxRaw = [], isLoading: loadingTax } = useQuery({
    queryKey: ['taxonomy'],
    queryFn: async () => {
      const res = await api.get('/taxonomy');
      return res.data;
    },
    enabled: !!user
  });

  // Calculate dynamic ACTS dictionary
  const ACTS = React.useMemo(() => {
    const dict = {};
    for (const t of taxRaw) {
      if (t.isActive) dict[t.actKey] = t;
    }
    return dict;
  }, [taxRaw]);

  const activeMaintenance = maintenanceEvent?.enabled ? maintenanceEvent : maintenanceStatus;
  const adminCanBypassMaintenance = user?.role === 'admin' && activeMaintenance?.adminBypass;
  if (!user) {
    return <LoginPage onLogin={u => { syncUser(u); navigate('/'); }} />;
  }

  if (activeMaintenance?.enabled && !adminCanBypassMaintenance) {
    return (
      <MaintenancePage
        status={activeMaintenance}
        currentUser={user}
        onRetry={() => {
          setMaintenanceEvent(null);
          refetchMaintenance();
        }}
      />
    );
  }

  // Define optimisic mutation callbacks to replace Prop Drilling useState
  const handleAddAct = () => {
    queryClient.invalidateQueries({ queryKey: ['activities-log'] });
    queryClient.invalidateQueries({ queryKey: ['activities'] });
  };
  const handleAdminEditNps = (actId, nps) => queryClient.setQueryData(['activities'], old => old.map(a => a.id === actId ? { ...a, kpi: { ...(a.kpi || {}), nps } } : a));
  const handleToggleMember = (id) => queryClient.setQueryData(['members'], old => old.map(m => m.id === id ? { ...m, status: m.status === "active" ? "suspended" : "active" } : m));
  const handleDeleteMember = async (id) => {
    await api.delete(`/users/${id}`);
    queryClient.setQueryData(['members'], old => (old || []).filter(m => m.id !== id));
    queryClient.invalidateQueries({ queryKey: ['members'] });
    queryClient.invalidateQueries({ queryKey: ['activities'] });
    queryClient.invalidateQueries({ queryKey: ['activities-log'] });
  };
  const handleAddMember = (m) => queryClient.setQueryData(['members'], old => [...(old || []), m]);
  const handleResetMemberPassword = async (id, newPassword) => {
    const res = await api.patch(`/users/${id}/reset-password`, { newPassword });
    return res.data;
  };
  const handleUpdateMemberSupervisor = async (id, supervisorId) => {
    const res = await api.patch(`/users/${id}`, { supervisorId: supervisorId || null });
    queryClient.setQueryData(['members'], old => (old || []).map(m => m.id === id ? { ...m, ...res.data } : m));
    queryClient.invalidateQueries({ queryKey: ['members'] });
    return res.data;
  };
  const handleUpdateMemberRole = async (id, role, team, clearSupervisor = false) => {
    const payload = { role, team };
    if (clearSupervisor) payload.supervisorId = null;
    const res = await api.patch(`/users/${id}`, payload);
    queryClient.setQueryData(['members'], old => (old || []).map(m => m.id === id ? { ...m, ...res.data } : m));
    queryClient.invalidateQueries({ queryKey: ['members'] });
    return res.data;
  };

  const TITLES = {
    "/": "Dashboard",
    "/activities": "Activity Log",
    "/members": "Team Members",
    "/reports": "Reports",
    "/reports/activity": "Activity Report",
    "/reports/kpi": "KPI Report",
    "/reports/nps": "NPS Report",
    "/reports/executive": "Executive Report",
    "/reports/jobs": "Job Report",
    "/profile": "Profil Saya",
    "/kpi-admin": "KPI",
    "/kpi-nps": "KPI NPS",
    "/audit": "Audit Trail",
    "/settings/smtp": "SMTP Settings",
    "/docs": "User Guide",
  };

  const view = location.pathname;
  const pageTitle = TITLES[view] || TITLES["/"];
  const isDocsPage = view === '/docs';
  const isLoading = loadingMembers || loadingActs || loadingTax;
  const hasPageFab = view === '/members';
  const canViewKpiReport = ['admin', 'mgr_dl', 'mgr_ps', 'head delivery', 'head presales'].includes(String(user.role || '').toLowerCase());
  const canViewNpsReport = canViewKpiNps(user.role);
  const canViewExecutiveReport = isMgr(user.role);
  const canViewJobsReport = canViewJobReport(user.role);

  return (
    <div style={{ fontFamily: FONT, background: T.bg, minHeight: "100vh", color: T.textPri }}>
      <Toaster position="top-center" richColors />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Inter+Tight:wght@600;700;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <div style={{ display: "flex", minHeight: "100vh" }}>
        
        {!isDocsPage && <Sidebar user={user} isMobile={isMobile} mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} onLogout={() => {
          api.post('/auth/logout').catch(() => null).finally(() => {
            clearAuthSession();
          });
        }} />}

        <main style={{ marginLeft: isDocsPage || isMobile ? 0 : 252, flex: 1, padding: isMobile ? "16px 14px 24px" : "22px 26px", minWidth: 0 }}>
          <div style={{ maxWidth: isDocsPage ? 1680 : 1480, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 12, flexWrap:"wrap", marginBottom: 22 }}>
              <div style={{ display:"flex", alignItems:isMobile ? "flex-start" : "center", gap:12 }}>
                {isMobile && !isDocsPage && (
                  <button
                    onClick={() => setMobileNavOpen(true)}
                    aria-label="Open menu"
                    style={{ width:42, height:42, borderRadius:12, border:`1px solid ${T.border}`, background:T.surfaceHi, color:T.textPri, cursor:"pointer", fontSize:18, flexShrink:0 }}
                  >
                    ☰
                  </button>
                )}
              <div>
                <div style={{ fontSize: 9, color: T.textMute, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 3 }}>
                  {new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </div>
                <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: T.textPri, fontFamily: DISPLAY, letterSpacing: "-.02em" }}>{pageTitle}</h1>
              </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={() => navigate('/docs')}
                  style={{
                    height: 34,
                    padding: '0 12px',
                    borderRadius: 10,
                    border: `1px solid ${view === '/docs' ? T.indigo : T.border}`,
                    background: view === '/docs' ? T.indigoLo : T.surfaceHi,
                    color: view === '/docs' ? T.indigoHi : T.textSec,
                    fontFamily: FONT,
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Docs
                </button>
                <Avi av={user.avatar} name={user.name} team={user.team} sz={28} />
                <RoleBadge role={user.role} />
              </div>
            </div>

            {activeMaintenance?.enabled && adminCanBypassMaintenance && (
              <div style={{ marginBottom:14,padding:'10px 13px',borderRadius:10,border:`1px solid ${T.amber}45`,background:T.amberLo,color:T.amber,fontSize:12,fontWeight:800 }}>
                Maintenance mode aktif. Admin bypass sedang digunakan.
              </div>
            )}

            {isLoading ? (
              <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "20px" }}>
                <div style={{ background: T.surface, height: 180, borderRadius: 16, animation: "pulse 1.5s infinite" }} />
                <div style={{ display: "flex", gap: "20px" }}>
                  <div style={{ background: T.surface, height: 350, flex: 2, borderRadius: 16, animation: "pulse 1.5s infinite" }} />
                  <div style={{ background: T.surface, height: 350, flex: 1, borderRadius: 16, animation: "pulse 1.5s infinite" }} />
                </div>
                <style>{`@keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 0.3; } 100% { opacity: 0.6; } }`}</style>
              </div>
            ) : (
              <TaxonomyContext.Provider value={ACTS}>
                <Routes>
                  <Route path="/" element={<DashboardView currentUser={user} activities={acts} members={members} onAdminEditNps={handleAdminEditNps} />} />
                  <Route path="/activities" element={<ActivitiesView currentUser={user} members={members} onAdd={handleAddAct} />} />
                  <Route path="/members" element={<MembersView currentUser={user} members={members} onToggle={handleToggleMember} onDelete={handleDeleteMember} onAdd={handleAddMember} onResetPassword={handleResetMemberPassword} onUpdateSupervisor={handleUpdateMemberSupervisor} onUpdateRole={handleUpdateMemberRole} activities={acts} />} />
                  <Route path="/reports" element={<Navigate to="/reports/activity" replace />} />
                  <Route path="/reports/activity" element={<ReportsView activities={acts} members={members} currentUser={user} />} />
                  <Route path="/reports/kpi" element={canViewKpiReport ? <KpiReportView activities={acts} members={members} currentUser={user} /> : <Navigate to="/reports/activity" replace />} />
                  <Route path="/reports/nps" element={canViewNpsReport ? <NpsReportView currentUser={user} /> : <Navigate to="/reports/activity" replace />} />
                  <Route path="/reports/executive" element={canViewExecutiveReport ? <ExecutiveReportView /> : <Navigate to="/reports/activity" replace />} />
                  <Route path="/reports/jobs" element={canViewJobsReport ? <JobReportView /> : <Navigate to="/reports/activity" replace />} />
                  <Route path="/profile" element={<ProfileView user={user} activities={acts} onUpdate={syncUser} />} />
                  <Route path="/kpi-admin" element={<KpiManagementView currentUser={user} />} />
                  <Route path="/kpi-nps" element={<KpiNpsView currentUser={user} />} />
                  <Route path="/audit" element={<AuditTrailView currentUser={user} />} />
                  <Route path="/taxonomy" element={<TaxonomyView currentUser={user} />} />
                  <Route path="/customers" element={<CustomersView currentUser={user} />} />
                  <Route path="/settings/smtp" element={<SmtpSettingsView currentUser={user} />} />
                  <Route path="/docs" element={<DocsView currentUser={user} />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </TaxonomyContext.Provider>
            )}
          </div>

        </main>
      </div>
      <button
        onClick={() => setTheme((prev) => prev === 'dark' ? 'light' : 'dark')}
        aria-label="Toggle theme"
        title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        style={{
          position: 'fixed',
          right: isMobile ? 14 : 22,
          bottom: hasPageFab ? (isMobile ? 84 : 92) : (isMobile ? 14 : 22),
          width: 58,
          height: 58,
          borderRadius: '999px',
          border: `1px solid ${T.borderHi}`,
          background: `linear-gradient(135deg, ${T.surfaceHi}, ${T.surface})`,
          color: T.textPri,
          boxShadow: theme === 'dark'
            ? '0 18px 40px rgba(0,0,0,.38)'
            : '0 18px 40px rgba(28,35,90,.18)',
          cursor: 'pointer',
          zIndex: 120,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          transition: 'transform .15s ease, box-shadow .15s ease, background .15s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
      >
        {theme === 'dark' ? '☀' : '☾'}
      </button>
    </div>
  );
}
