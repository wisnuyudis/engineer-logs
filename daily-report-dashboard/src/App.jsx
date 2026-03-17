import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { LoginPage } from './components/LoginPage';
import { DashboardView } from './components/DashboardView';
import { ActivitiesView } from './components/ActivitiesView';
import { MembersView } from './components/MembersView';
import { ReportsView } from './components/ReportsView';
import { ProfileView } from './components/ProfileView';
import { T, FONT, DISPLAY } from './theme/tokens';
import { RoleBadge, Avi } from './components/ui/Primitives';
import { Toaster, toast } from 'sonner';
import api from './lib/api';

export default function App() {
  const [user,setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('user');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const [view,setView] = useState("dashboard");
  const [members,setMembers] = useState([]);
  const [acts,setActs] = useState([]);

  useEffect(() => {
    if (user) {
      Promise.all([
        api.get('/activities'),
        api.get('/users')
      ])
        .then(([resActs, resUsers]) => {
          setMembers(resUsers.data);
          const normalized = resActs.data.map(a => ({
            ...a,
            user: a.user?.name,
            userTeam: a.user?.team,
            kpi: { nps: a.nps }
          }));
          setActs(normalized);
        })
        .catch(err => {
          console.error(err);
          toast.error("Gagal memuat data utama (Activity / User)");
        });
    } else {
      setActs([]);
      setMembers([]);
    }
  }, [user]);

  if(!user) return <LoginPage onLogin={u=>{setUser(u);setView("dashboard");}} />;

  const TITLES = {
    dashboard: "Dashboard",
    activities: "Activity Log",
    members: "Team Members",
    reports: "Reports",
    profile: "Profil Saya"
  };

  return (
    <div style={{ fontFamily:FONT,background:T.bg,minHeight:"100vh",color:T.textPri }}>
      <Toaster position="top-center" richColors />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=Syne:wght@700;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <div style={{ display:"flex",minHeight:"100vh" }}>
        <Sidebar user={user} view={view} setView={setView} onLogout={()=>{
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
          setView("dashboard");
        }} />
        <main style={{ marginLeft:220,flex:1,padding:"22px 26px",minWidth:0 }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22 }}>
            <div>
              <div style={{ fontSize:9,color:T.textMute,letterSpacing:".08em",textTransform:"uppercase",marginBottom:3 }}>
                {new Date().toLocaleDateString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
              </div>
              <h1 style={{ margin:0,fontSize:20,fontWeight:800,color:T.textPri,fontFamily:DISPLAY,letterSpacing:"-.02em" }}>{TITLES[view]}</h1>
            </div>
            <div style={{ display:"flex",alignItems:"center",gap:8 }}>
              <Avi av={user.avatar} team={user.team} sz={28} />
              <RoleBadge role={user.role} />
            </div>
          </div>
          {view==="dashboard"  && <DashboardView currentUser={user} activities={acts} members={members} onAdminEditNps={(actId,nps)=>setActs(p=>p.map(a=>a.id===actId?{...a,kpi:{...(a.kpi||{}),nps}}:a))} />}
          {view==="activities" && <ActivitiesView currentUser={user} activities={acts} members={members} onAdd={a=>setActs(p=>[a,...p])} />}
          {view==="members"    && <MembersView currentUser={user} members={members} onToggle={id=>setMembers(p=>p.map(m=>m.id===id?{...m,status:m.status==="active"?"suspended":"active"}:m))} onDelete={id=>setMembers(p=>p.filter(m=>m.id!==id))} onAdd={m=>setMembers(p=>[...p,m])} activities={acts} />}
          {view==="reports"    && <ReportsView activities={acts} members={members} currentUser={user} />}
          {view==="profile"    && <ProfileView user={user} activities={acts} onUpdate={u=>setUser(u)} />}
        </main>
      </div>
    </div>
  );
}
