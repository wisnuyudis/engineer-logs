import { useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sidebar } from './components/Sidebar';
import { LoginPage } from './components/LoginPage';
import { DashboardView } from './components/DashboardView';
import { ActivitiesView } from './components/ActivitiesView';
import { MembersView } from './components/MembersView';
import { ReportsView } from './components/ReportsView';
import { ProfileView } from './components/ProfileView';
import { TaxonomyView } from './components/TaxonomyView';
import { TaxonomyContext } from './contexts/TaxonomyContext';
import { T, FONT, DISPLAY } from './theme/tokens';
import { RoleBadge, Avi } from './components/ui/Primitives';
import { Toaster } from 'sonner';
import React from 'react';
import api from './lib/api';

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('user');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });

  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
      const res = await api.get('/activities');
      return res.data.map(a => ({
        ...a,
        user: a.user?.name,
        userTeam: a.user?.team,
        kpi: { nps: a.nps }
      }));
    },
    enabled: !!user
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

  if (!user) {
    return <LoginPage onLogin={u => { setUser(u); navigate('/'); }} />;
  }

  // Define optimisic mutation callbacks to replace Prop Drilling useState
  const handleAddAct = (a) => queryClient.setQueryData(['activities'], (old) => [a, ...(old || [])]);
  const handleAdminEditNps = (actId, nps) => queryClient.setQueryData(['activities'], old => old.map(a => a.id === actId ? { ...a, kpi: { ...(a.kpi || {}), nps } } : a));
  const handleToggleMember = (id) => queryClient.setQueryData(['members'], old => old.map(m => m.id === id ? { ...m, status: m.status === "active" ? "suspended" : "active" } : m));
  const handleDeleteMember = (id) => queryClient.setQueryData(['members'], old => old.filter(m => m.id !== id));
  const handleAddMember = (m) => queryClient.setQueryData(['members'], old => [...(old || []), m]);

  const TITLES = {
    "/": "Dashboard",
    "/activities": "Activity Log",
    "/members": "Team Members",
    "/reports": "Reports",
    "/profile": "Profil Saya"
  };

  const view = location.pathname;
  const pageTitle = TITLES[view] || TITLES["/"];
  const isLoading = loadingMembers || loadingActs || loadingTax;

  return (
    <div style={{ fontFamily: FONT, background: T.bg, minHeight: "100vh", color: T.textPri }}>
      <Toaster position="top-center" richColors />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=Syne:wght@700;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <div style={{ display: "flex", minHeight: "100vh" }}>
        
        <Sidebar user={user} onLogout={() => {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          queryClient.clear();
          setUser(null);
        }} />

        <main style={{ marginLeft: 220, flex: 1, padding: "22px 26px", minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
            <div>
              <div style={{ fontSize: 9, color: T.textMute, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 3 }}>
                {new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: T.textPri, fontFamily: DISPLAY, letterSpacing: "-.02em" }}>{pageTitle}</h1>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Avi av={user.avatar} team={user.team} sz={28} />
              <RoleBadge role={user.role} />
            </div>
          </div>

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
                <Route path="/activities" element={<ActivitiesView currentUser={user} activities={acts} members={members} onAdd={handleAddAct} />} />
                <Route path="/members" element={<MembersView currentUser={user} members={members} onToggle={handleToggleMember} onDelete={handleDeleteMember} onAdd={handleAddMember} activities={acts} />} />
                <Route path="/reports" element={<ReportsView activities={acts} members={members} currentUser={user} />} />
                <Route path="/profile" element={<ProfileView user={user} activities={acts} onUpdate={u => setUser(u)} />} />
                <Route path="/taxonomy" element={<TaxonomyView currentUser={user} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </TaxonomyContext.Provider>
          )}

        </main>
      </div>
    </div>
  );
}
