import { T, FONT, DISPLAY } from '../theme/tokens';
import { canManageKpi, teamOf } from '../constants/taxonomy';
import { Avi } from './ui/Primitives';
import { useNavigate, useLocation } from 'react-router-dom';

export function Sidebar({ user, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const activePath = location.pathname;

  const navItems = [
    { id: "/", icon: "▦", label: "Dashboard" },
    { id: "/activities", icon: "◈", label: "Activity Log" },
    { id: "/members", icon: "◉", label: "Team Members" },
    { id: "/reports", icon: "⊞", label: "Reports" },
  ];
  if (canManageKpi(user.role)) {
    navItems.push({ id: "/kpi-admin", icon: "◌", label: "KPI" });
  }
  if (user.role === 'admin') {
    navItems.push({ id: "/taxonomy", icon: "🗂", label: "Master Kategori" });
  }
  
  const team = teamOf(user.role);
  const teamColor = team==="presales"?T.violet:team==="delivery"?T.teal:T.indigoHi;
  
  return (
    <aside style={{ width:220,background:T.surface,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",position:"fixed",height:"100vh",zIndex:50 }}>
      <div style={{ padding:"18px 14px 12px",borderBottom:`1px solid ${T.border}` }}>
        <div style={{ display:"flex",alignItems:"center",gap:9,marginBottom:10 }}>
          <div style={{ width:30,height:30,borderRadius:8,background:`linear-gradient(135deg,${T.indigo},${T.indigoHi})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:"#fff",fontFamily:DISPLAY,boxShadow:`0 4px 12px ${T.indigo}40` }}>S</div>
          <div><div style={{ fontWeight:800,fontSize:13,color:T.textPri,fontFamily:DISPLAY,letterSpacing:"-.02em" }}>EngineerLog</div><div style={{ fontSize:8,color:T.textMute,letterSpacing:".07em" }}>SERAPHIM</div></div>
        </div>
        <div style={{ padding:"3px 8px",borderRadius:5,fontSize:9,fontWeight:700,letterSpacing:".04em",display:"inline-flex",alignItems:"center",gap:4,background:`${teamColor}18`,color:teamColor,border:`1px solid ${teamColor}30` }}>
          {team==="presales"?"🎯 Pre-Sales":team==="delivery"?"🗂 Delivery":"⚙ Admin"}
        </div>
      </div>
      
      <nav style={{ padding:"8px 6px",flex:1 }}>
        {navItems.map(n=>{
          const active = activePath === n.id;
          return <button key={n.id} onClick={()=>navigate(n.id)} style={{ width:"100%",display:"flex",alignItems:"center",gap:9,padding:"7px 10px",borderRadius:8,border:"none",cursor:"pointer",marginBottom:1,textAlign:"left",fontFamily:FONT,fontSize:12,fontWeight:active?600:400,transition:"all .15s",background:active?T.indigoLo:"transparent",color:active?T.indigoHi:T.textSec,borderLeft:active?`2px solid ${T.indigo}`:"2px solid transparent" }}>
            <span style={{ fontSize:12 }}>{n.icon}</span>{n.label}
          </button>;})}
      </nav>
      
      <div style={{ padding:"8px 6px",borderTop:`1px solid ${T.border}` }}>
        <button onClick={()=>navigate("/profile")} style={{ width:"100%",display:"flex",alignItems:"center",gap:9,padding:"8px 9px",borderRadius:9,cursor:"pointer",background:activePath==="/profile"?T.indigoLo:T.surfaceHi,border:`1px solid ${activePath==="/profile"?T.indigo+"40":T.border}`,fontFamily:FONT,transition:"all .15s",marginBottom:6 }}>
          <Avi av={user.avatar} team={user.team} sz={30} />
          <div style={{ flex:1,overflow:"hidden",textAlign:"left" }}>
            <div style={{ fontSize:11,fontWeight:600,color:T.textPri,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{user.name}</div>
            <div style={{ fontSize:9,color:T.textMute }}>Lihat profil</div>
          </div>
        </button>
        <button onClick={onLogout} style={{ width:"100%",padding:"5px",borderRadius:7,border:`1px solid ${T.border}`,background:"transparent",color:T.textMute,cursor:"pointer",fontFamily:FONT,fontSize:10 }}>⏻ Keluar</button>
      </div>
    </aside>
  );
}
