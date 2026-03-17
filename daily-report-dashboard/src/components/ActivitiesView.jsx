import { useState, useMemo } from 'react';
import { T } from '../theme/tokens';
import { actsFor, teamOf, isMgr, isAdmin, isPM, ACTS } from '../constants/taxonomy';
import { Pill, Card, Modal, MHead } from './ui/Primitives';
import { ActCard } from './shared/ActCard';
import { LogForm } from './LogForm';

export function ActivitiesView({ currentUser, activities, members, onAdd }) {
  const [logOpen, setLog] = useState(false);
  const [filter, setFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [page, setPage] = useState(1);
  const myTeam = teamOf(currentUser.role);
  const availActs = useMemo(() => actsFor(currentUser.role), [currentUser.role]);

  const isLeader = isAdmin(currentUser.role)||isMgr(currentUser.role)||isPM(currentUser.role);

  const teamMembers = useMemo(() => {
    if(!members) return [];
    if(isAdmin(currentUser.role)) return members;
    return members.filter(m => m.supervisorId === currentUser.id || m.id === currentUser.id);
  }, [members, currentUser]);

  const visible = useMemo(() => {
    let list = isLeader ? activities : activities.filter(a=>a.user===currentUser.name);
    if(myTeam!=="all") list=list.filter(a=>a.userTeam===myTeam);
    if(userFilter!=="all") list=list.filter(a=>a.userId===userFilter || a.user===userFilter);
    if(filter==="jira")   list=list.filter(a=>ACTS[a.actKey]?.source==="jira");
    if(filter==="nonjira")list=list.filter(a=>ACTS[a.actKey]?.source==="app");
    if(filter!=="all"&&filter!=="jira"&&filter!=="nonjira") list=list.filter(a=>a.actKey===filter);
    
    // Sort logic -> backend already sorts by created, but if it has date we can sort descending
    return list.sort((a,b) => new Date(b.date) - new Date(a.date));
  },[activities, filter, userFilter, currentUser, myTeam, isLeader]);

  const itemsPerPage = 8;
  const totalPages = Math.ceil(visible.length / itemsPerPage) || 1;
  const paginated = visible.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const jiraKeys   = Object.entries(availActs).filter(([,v])=>v.source==="jira").map(([k])=>k);
  const appKeys    = Object.entries(availActs).filter(([,v])=>v.source==="app").map(([k])=>k);

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center",justifyContent:"space-between" }}>
        <div style={{ display:"flex",gap:5,flexWrap:"wrap",alignItems:"center" }}>
          <Pill active={filter==="all"} color={T.indigoHi} lo={T.indigoLo} onClick={()=>{setFilter("all");setPage(1);}}>Semua ({activities.filter(a=>myTeam==="all"||a.userTeam===myTeam).length})</Pill>
          <div style={{ width:1,height:18,background:T.border }} />
          <Pill active={filter==="jira"} color={T.jira} lo={T.jiraLo} onClick={()=>{setFilter("jira");setPage(1);}} small>◈ Jira</Pill>
          <Pill active={filter==="nonjira"} color={T.textSec} lo={T.border} onClick={()=>{setFilter("nonjira");setPage(1);}} small>Non-Jira</Pill>
          <div style={{ width:1,height:18,background:T.border }} />
          {[...jiraKeys,...appKeys].map(k=>{
            const v=ACTS[k]; const cnt=activities.filter(a=>a.actKey===k&&(myTeam==="all"||a.userTeam===myTeam)).length;
            if(!cnt) return null;
            return <Pill key={k} active={filter===k} color={v.color} lo={v.colorLo} onClick={()=>{setFilter(k);setPage(1);}} small>{v.icon} {v.label} ({cnt})</Pill>;
          })}
        </div>
        
        {isLeader && teamMembers?.length > 0 && (
          <select value={userFilter} onChange={e=>{setUserFilter(e.target.value);setPage(1);}}
            style={{ padding:"6px 10px",borderRadius:8,border:`1.5px solid ${T.border}`,background:T.surfaceHi,color:T.textPri,fontSize:12,outline:"none" }}>
            <option value="all">👥 Semua Engineer</option>
            {teamMembers.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
          </select>
        )}
      </div>
      <div style={{ display:"flex",flexDirection:"column",gap:6,minHeight:400 }}>
        {visible.length===0 && (
          <Card p={40} style={{ textAlign:"center" }}>
            <div style={{ fontSize:13,color:T.textMute }}>Tidak ada aktivitas untuk filter ini.</div>
          </Card>
        )}
        {paginated.map(a => <ActCard key={a.id} act={a} />)}
      </div>

      {/* Pagination Controls */}
      {visible.length > 0 && (
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:16 }}>
          <span style={{ fontSize:12,color:T.textMute }}>
            Menampilkan {(page-1)*itemsPerPage + 1} – {Math.min(page*itemsPerPage, visible.length)} dari {visible.length} data
          </span>
          <div style={{ display:"flex",gap:6 }}>
            <button disabled={page===1} onClick={()=>setPage(p=>Math.max(1, p-1))}
              style={{ cursor:page===1?"not-allowed":"pointer",padding:"5px 12px",borderRadius:6,border:`1px solid ${T.border}`,background:T.surface,color:page===1?T.textMute:T.textPri }}>
              ← Prev
            </button>
            <div style={{ padding:"5px 12px",fontSize:12,color:T.textPri,display:"flex",alignItems:"center",background:T.surfaceHi,borderRadius:6,border:`1px solid ${T.border}` }}>
              {page} / {totalPages}
            </div>
            <button disabled={page===totalPages} onClick={()=>setPage(p=>Math.min(totalPages, p+1))}
              style={{ cursor:page===totalPages?"not-allowed":"pointer",padding:"5px 12px",borderRadius:6,border:`1px solid ${T.border}`,background:T.surface,color:page===totalPages?T.textMute:T.textPri }}>
              Next →
            </button>
          </div>
        </div>
      )}

      <Modal open={logOpen} onClose={()=>setLog(false)} width={560}>
        <MHead title="Log Aktivitas" sub={new Date().toLocaleDateString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric"})} onClose={()=>setLog(false)} />
        <LogForm user={currentUser} onSave={a=>{onAdd(a);setLog(false);}} onCancel={()=>setLog(false)} />
      </Modal>
      <button onClick={()=>setLog(true)} style={{ position:"fixed",bottom:28,right:28,width:52,height:52,borderRadius:"50%",background:`linear-gradient(135deg,${T.indigo},${T.indigoHi})`,color:"#fff",border:"none",fontSize:22,cursor:"pointer",boxShadow:`0 4px 20px ${T.indigo}60`,display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,transition:"transform .15s" }}
        onMouseEnter={e=>e.currentTarget.style.transform="scale(1.08)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>+</button>
    </div>
  );
}
