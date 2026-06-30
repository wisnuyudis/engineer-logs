import { useState } from 'react';
import { T, FONT, DISPLAY } from '../theme/tokens';
import { canManageKpi, canManageKpiNps, canViewJobReport, canViewKpiNps, isMgr, teamOf } from '../constants/taxonomy';
import { Avi, RoleBadge, TeamBadge, Divider } from './ui/Primitives';
import { useNavigate, useLocation } from 'react-router-dom';

export function Sidebar({ user, onLogout, isMobile = false, mobileOpen = false, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const activePath = location.pathname;
  const [openGroups, setOpenGroups] = useState({});
  const canViewKpiReport = ['admin', 'mgr_dl', 'mgr_ps', 'head delivery', 'head presales'].includes(String(user.role || '').toLowerCase());
  const canViewNpsReport = canViewKpiNps(user.role);
  const canViewJobs = canViewJobReport(user.role);

  const coreItems = [
    { id: "/", icon: "▦", label: "Dashboard" },
    { id: "/activities", icon: "◈", label: "Activity Log" },
    { id: "/members", icon: "◉", label: "Team Members" },
  ];
  const workspaceGroups = [
    {
      id: 'reports',
      icon: '⊞',
      label: 'Reports',
      children: [
        { id: "/reports/activity", icon: "▤", label: "Activity Report" },
        ...(canViewKpiReport ? [{ id: "/reports/kpi", icon: "◇", label: "KPI Report" }] : []),
        ...(canViewNpsReport ? [{ id: "/reports/nps", icon: "◎", label: "NPS Report" }] : []),
        ...(isMgr(user.role) ? [{ id: "/reports/executive", icon: "▧", label: "Executive Report" }] : []),
        ...(canViewJobs ? [{ id: "/reports/jobs", icon: "▥", label: "Job Report" }] : []),
      ],
    },
  ];
  const adminGroups = [];
  const kpiChildren = [];
  if (canManageKpi(user.role)) {
    kpiChildren.push({ id: "/kpi-admin", icon: "◌", label: "Scorecard" });
  }
  if (canManageKpiNps(user.role)) {
    kpiChildren.push({ id: "/kpi-nps", icon: "◎", label: "NPS" });
  }
  if (kpiChildren.length) {
    adminGroups.push({ id: 'kpi', icon: '◆', label: 'KPI', children: kpiChildren });
  }
  if (user.role === 'admin') {
    adminGroups.push({
      id: 'settings',
      icon: '⚙',
      label: 'Setting',
      children: [
        { id: "/taxonomy", icon: "🗂", label: "Master Activity" },
        { id: "/customers", icon: "▣", label: "Master Customer" },
        { id: "/settings/smtp", icon: "✉", label: "SMTP" },
      ],
    });
    adminGroups.push({ id: 'audit', children: [{ id: "/audit", icon: "⌘", label: "Audit Trail" }] });
  }
  
  const team = teamOf(user.role);
  const teamColor = team==="presales"?T.violet:team==="delivery"?T.teal:T.indigoHi;

  const asideStyle = {
    width: isMobile ? "min(86vw, 320px)" : 252,
    background:`linear-gradient(180deg,${T.surface},${T.bg})`,
    borderRight:`1px solid ${T.border}`,
    display:"flex",
    flexDirection:"column",
    position:"fixed",
    height:"100vh",
    zIndex:140,
    boxShadow:"8px 0 30px rgba(0,0,0,.18)",
    top:0,
    left:0,
    transform: isMobile ? (mobileOpen ? "translateX(0)" : "translateX(-105%)") : "translateX(0)",
    transition:"transform .2s ease",
  };
  
  return (
    <>
      {isMobile && mobileOpen && (
        <button
          onClick={onClose}
          aria-label="Close menu"
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", border:"none", padding:0, zIndex:130, cursor:"pointer" }}
        />
      )}
    <aside style={asideStyle}>
      <div style={{ padding:"18px 16px 14px",borderBottom:`1px solid ${T.border}` }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:10 }}>
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          <div style={{ width:34,height:34,borderRadius:10,background:`linear-gradient(135deg,${T.indigo},${T.indigoHi})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:"#fff",fontFamily:DISPLAY,boxShadow:`0 8px 18px ${T.indigo}35` }}>S</div>
          <div>
            <div style={{ fontWeight:800,fontSize:14,color:T.textPri,fontFamily:DISPLAY,letterSpacing:"-.02em" }}>EngineerLog</div>
            <div style={{ fontSize:8,color:T.textMute,letterSpacing:".12em" }}>SERAPHIM</div>
          </div>
          </div>
          {isMobile && (
            <button
              onClick={onClose}
              style={{ width:32,height:32,borderRadius:8,border:`1px solid ${T.border}`,background:T.surfaceHi,color:T.textSec,cursor:"pointer",fontSize:16 }}
            >
              ×
            </button>
          )}
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
          return <button key={n.id} onClick={()=>{navigate(n.id); onClose?.();}} style={{ width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,border:"none",cursor:"pointer",marginBottom:4,textAlign:"left",fontFamily:FONT,fontSize:12,fontWeight:active?700:500,transition:"all .15s",background:active?`linear-gradient(135deg,${T.indigoLo},${T.surfaceHi})`: "transparent",color:active?T.textPri:T.textSec,borderLeft:active?`3px solid ${T.indigo}`:"3px solid transparent",boxShadow:active?`0 8px 20px ${T.indigo}15`:"none" }}>
            <span style={{ fontSize:13,opacity:active?1:.8 }}>{n.icon}</span>
            <span style={{ letterSpacing:".01em" }}>{n.label}</span>
          </button>;})}
        {workspaceGroups.map((group) => (
          <NavGroup
            key={group.id}
            group={group}
            activePath={activePath}
            open={openGroups[group.id]}
            onToggle={() => setOpenGroups((prev) => ({ ...prev, [group.id]: !prev[group.id] }))}
            onClick={(id)=>{navigate(id); onClose?.();}}
          />
        ))}
        {adminGroups.length > 0 && (
          <>
            <Divider my={12} />
            <Section title="Admin" />
            {adminGroups.map((group) => {
              if (group.children.length === 1 && !group.label) {
                return <NavItem key={group.children[0].id} item={group.children[0]} activePath={activePath} onClick={(id)=>{navigate(id); onClose?.();}} accent={T.violet} accentLo={T.violetLo} />;
              }
              return (
                <NavGroup
                  key={group.id}
                  group={group}
                  activePath={activePath}
                  open={openGroups[group.id]}
                  onToggle={() => setOpenGroups((prev) => ({ ...prev, [group.id]: !prev[group.id] }))}
                  onClick={(id)=>{navigate(id); onClose?.();}}
                />
              );
            })}
          </>
        )}
      </nav>
      
      <div style={{ padding:"12px 10px 14px",borderTop:`1px solid ${T.border}` }}>
        <button onClick={()=>{navigate("/profile"); onClose?.();}} style={{ width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px",borderRadius:12,cursor:"pointer",background:activePath==="/profile"?T.indigoLo:T.surfaceHi,border:`1px solid ${activePath==="/profile"?T.indigo+"40":T.border}`,fontFamily:FONT,transition:"all .15s",marginBottom:8 }}>
          <Avi av={user.avatar} name={user.name} team={user.team} sz={34} />
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
    </>
  );
}

function Section({ title }) {
  return (
    <div style={{ fontSize:9,fontWeight:800,color:T.textMute,letterSpacing:".12em",textTransform:"uppercase",padding:"0 4px 8px" }}>
      {title}
    </div>
  );
}

function NavItem({ item, activePath, onClick, accent = T.indigo, accentLo = T.indigoLo, child = false }) {
  const active = activePath === item.id;
  return (
    <button
      onClick={() => onClick(item.id)}
      style={{
        width:"100%",
        display:"flex",
        alignItems:"center",
        gap:10,
        padding: child ? "8px 12px 8px 24px" : "10px 12px",
        borderRadius:10,
        border:"none",
        cursor:"pointer",
        marginBottom:4,
        textAlign:"left",
        fontFamily:FONT,
        fontSize: child ? 11 : 12,
        fontWeight:active?700:500,
        transition:"all .15s",
        background:active?`linear-gradient(135deg,${accentLo},${T.surfaceHi})`:"transparent",
        color:active?T.textPri:T.textSec,
        borderLeft:active?`3px solid ${accent}`:"3px solid transparent",
        boxShadow:active?`0 8px 20px ${accent}12`:"none"
      }}
    >
      <span style={{ fontSize:12,opacity:active?1:.75 }}>{item.icon}</span>
      <span style={{ letterSpacing:".01em" }}>{item.label}</span>
    </button>
  );
}

function NavGroup({ group, activePath, onClick, open, onToggle }) {
  const active = group.children.some((child) => activePath === child.id);
  const expanded = Boolean(open || active);
  return (
    <div style={{ marginBottom:6 }}>
      <button
        onClick={onToggle}
        style={{ width:"100%",display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:10,border:"none",background:active?T.violetLo:"transparent",fontFamily:FONT,fontSize:11,fontWeight:800,color:active?T.textPri:T.textMute,letterSpacing:".04em",textTransform:"uppercase",cursor:"pointer",textAlign:"left" }}
      >
        <span style={{ fontSize:12,color:active?T.violet:T.textMute }}>{group.icon}</span>
        <span style={{ flex:1 }}>{group.label}</span>
        <span style={{ fontSize:10,color:active?T.violet:T.textMute,transform:expanded?"rotate(90deg)":"rotate(0deg)",transition:"transform .15s" }}>›</span>
      </button>
      {expanded && (
        <div style={{ borderLeft:`1px solid ${active?T.violet+"55":T.border}`,marginLeft:16,paddingLeft:4,marginTop:4 }}>
          {group.children.map((item) => (
            <NavItem key={item.id} item={item} activePath={activePath} onClick={onClick} accent={T.violet} accentLo={T.violetLo} child />
          ))}
        </div>
      )}
    </div>
  );
}
