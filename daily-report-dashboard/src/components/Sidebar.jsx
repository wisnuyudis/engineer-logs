import { T, FONT, DISPLAY } from '../theme/tokens';
import { canManageKpi, teamOf } from '../constants/taxonomy';
import { Avi, RoleBadge, TeamBadge, Divider } from './ui/Primitives';
import { useNavigate, useLocation } from 'react-router-dom';

export function Sidebar({ user, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const activePath = location.pathname;

  const coreItems = [
    { id: "/", icon: "▦", label: "Dashboard" },
    { id: "/activities", icon: "◈", label: "Activity Log" },
    { id: "/members", icon: "◉", label: "Team Members" },
    { id: "/reports", icon: "⊞", label: "Reports" },
  ];
  const adminItems = [];
  if (canManageKpi(user.role)) {
    adminItems.push({ id: "/kpi-admin", icon: "◌", label: "KPI" });
  }
  if (user.role === 'admin') {
    adminItems.push({ id: "/audit", icon: "⌘", label: "Audit Trail" });
    adminItems.push({ id: "/taxonomy", icon: "🗂", label: "Master Kategori" });
  }
  
  const team = teamOf(user.role);
  const teamColor = team==="presales"?T.violet:team==="delivery"?T.teal:T.indigoHi;
  
  return (
    <aside style={{ width:252,background:`linear-gradient(180deg,${T.surface},${T.bg})`,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",position:"fixed",height:"100vh",zIndex:50,boxShadow:"8px 0 30px rgba(0,0,0,.18)" }}>
      <div style={{ padding:"18px 16px 14px",borderBottom:`1px solid ${T.border}` }}>
        <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:10 }}>
          <div style={{ width:34,height:34,borderRadius:10,background:`linear-gradient(135deg,${T.indigo},${T.indigoHi})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:"#fff",fontFamily:DISPLAY,boxShadow:`0 8px 18px ${T.indigo}35` }}>S</div>
          <div>
            <div style={{ fontWeight:800,fontSize:14,color:T.textPri,fontFamily:DISPLAY,letterSpacing:"-.02em" }}>EngineerLog</div>
            <div style={{ fontSize:8,color:T.textMute,letterSpacing:".12em" }}>SERAPHIM</div>
          </div>
        </div>
        <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
          <div style={{ padding:"6px 9px",borderRadius:8,fontSize:9,fontWeight:700,letterSpacing:".04em",display:"inline-flex",alignItems:"center",gap:6,background:`${teamColor}16`,color:teamColor,border:`1px solid ${teamColor}24`,width:"fit-content" }}>
            {team==="presales"?"🎯 Pre-Sales":team==="delivery"?"🗂 Delivery":"⚙ Admin"}
          </div>
          <div style={{ fontSize:10,color:T.textMute,lineHeight:1.4 }}>
            {user.email}
          </div>
        </div>
      </div>
      
      <nav style={{ padding:"12px 10px",flex:1,overflowY:"auto" }}>
        <Section title="Workspace" />
        {coreItems.map(n=>{
          const active = activePath === n.id;
          return <button key={n.id} onClick={()=>navigate(n.id)} style={{ width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,border:"none",cursor:"pointer",marginBottom:4,textAlign:"left",fontFamily:FONT,fontSize:12,fontWeight:active?700:500,transition:"all .15s",background:active?`linear-gradient(135deg,${T.indigoLo},${T.surfaceHi})`: "transparent",color:active?T.textPri:T.textSec,borderLeft:active?`3px solid ${T.indigo}`:"3px solid transparent",boxShadow:active?`0 8px 20px ${T.indigo}15`:"none" }}>
            <span style={{ fontSize:13,opacity:active?1:.8 }}>{n.icon}</span>
            <span style={{ letterSpacing:".01em" }}>{n.label}</span>
          </button>;})}
        {adminItems.length > 0 && (
          <>
            <Divider my={12} />
            <Section title="Admin" />
            {adminItems.map(n=>{
              const active = activePath === n.id;
              return <button key={n.id} onClick={()=>navigate(n.id)} style={{ width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,border:"none",cursor:"pointer",marginBottom:4,textAlign:"left",fontFamily:FONT,fontSize:12,fontWeight:active?700:500,transition:"all .15s",background:active?`linear-gradient(135deg,${T.violetLo},${T.surfaceHi})`:"transparent",color:active?T.textPri:T.textSec,borderLeft:active?`3px solid ${T.violet}`:"3px solid transparent",boxShadow:active?`0 8px 20px ${T.violet}12`:"none" }}>
                <span style={{ fontSize:13,opacity:active?1:.8 }}>{n.icon}</span>
                <span style={{ letterSpacing:".01em" }}>{n.label}</span>
              </button>;})}
          </>
        )}
      </nav>
      
      <div style={{ padding:"12px 10px 14px",borderTop:`1px solid ${T.border}` }}>
        <button onClick={()=>navigate("/profile")} style={{ width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px",borderRadius:12,cursor:"pointer",background:activePath==="/profile"?T.indigoLo:T.surfaceHi,border:`1px solid ${activePath==="/profile"?T.indigo+"40":T.border}`,fontFamily:FONT,transition:"all .15s",marginBottom:8 }}>
          <Avi av={user.avatar} team={user.team} sz={34} />
          <div style={{ flex:1,overflow:"hidden",textAlign:"left" }}>
            <div style={{ fontSize:12,fontWeight:700,color:T.textPri,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{user.name}</div>
            <div style={{ marginTop:4,display:"flex",gap:4,flexWrap:"wrap" }}>
              <RoleBadge role={user.role} />
              <TeamBadge team={user.team} />
            </div>
          </div>
        </button>
        <button onClick={onLogout} style={{ width:"100%",padding:"8px 10px",borderRadius:10,border:`1px solid ${T.border}`,background:`linear-gradient(135deg,${T.surfaceHi},${T.surface})`,color:T.textSec,cursor:"pointer",fontFamily:FONT,fontSize:11,fontWeight:600 }}>⏻ Keluar</button>
      </div>
    </aside>
  );
}

function Section({ title }) {
  return (
    <div style={{ fontSize:9,fontWeight:800,color:T.textMute,letterSpacing:".12em",textTransform:"uppercase",padding:"0 4px 8px" }}>
      {title}
    </div>
  );
}
