import { useState, useMemo } from 'react';
import { T, FONT, MONO } from '../theme/tokens';
import { ACTS, ROLES, isAdmin, isMgr } from '../constants/taxonomy';
import { exportCSV, exportPDF } from '../utils/exports';
import { Card, Pill, Lbl, Inp, Btn, Divider, Tag, Avi } from './ui/Primitives';
import { fmtH } from '../utils/formatters';

export function ReportsView({ activities, members, currentUser }) {
  const [teamF,setTF]=useState("all");
  const [userSel,setUS]=useState([]); // multi-select array of names
  const [memberDDOpen,setMDD]=useState(false);
  const [dateFrom,setDF]=useState("");
  const [dateTo,setDT]=useState("");
  const [srcF,setSrc]=useState("all");
  const [custF,setCustF]=useState("");
  const [sortCol,setSort]=useState("date");
  const [sortDir,setSortDir]=useState("desc"); // asc | desc

  const canSeeAll = isAdmin(currentUser.role) || isMgr(currentUser.role);

  const toggleSort = (col) => {
    if(sortCol===col) setSortDir(d=>d==="asc"?"desc":"asc");
    else { setSort(col); setSortDir("asc"); }
  };

  const teamUsers = useMemo(()=>{
    if(!canSeeAll) return members.filter(m=>m.name===currentUser.name);
    // Mgr hanya bisa lihat direct reports; Admin bisa lihat semua
    const base = isAdmin(currentUser.role)
      ? members
      : members.filter(m=>m.supervisorId===currentUser.id||m.id===currentUser.id);
    return (teamF==="all"?base:base.filter(m=>m.team===teamF)).filter(m=>m.status!=="invited");
  },[members,teamF,canSeeAll,currentUser]);
  const visible = useMemo(()=>{
    let l=activities;
    // Non-admin/mgr: hanya lihat aktivitas sendiri
    if(!canSeeAll) l=l.filter(a=>a.user===currentUser.name);
    else {
      if(teamF!=="all") l=l.filter(a=>a.userTeam===teamF);
      if(userSel.length>0) l=l.filter(a=>userSel.includes(a.user));
    }
    if(custF.trim()) l=l.filter(a=>(a.customerName||a.prName||"").toLowerCase().includes(custF.trim().toLowerCase()));
    if(srcF==="jira")    l=l.filter(a=>ACTS[a.actKey]?.source==="jira");
    if(srcF==="nonjira") l=l.filter(a=>ACTS[a.actKey]?.source==="app");
    if(dateFrom) l=l.filter(a=>a.date>=dateFrom);
    if(dateTo)   l=l.filter(a=>a.date<=dateTo);
    // Sort
    l=[...l].sort((a,b)=>{
      let va,vb;
      if(sortCol==="date")     { va=a.date;    vb=b.date; }
      else if(sortCol==="user"){ va=a.user;    vb=b.user; }
      else if(sortCol==="dur") { va=a.dur;     vb=b.dur; }
      else if(sortCol==="cat") { va=ACTS[a.actKey]?.label||""; vb=ACTS[b.actKey]?.label||""; }
      else if(sortCol==="status"){ va=a.status; vb=b.status; }
      else if(sortCol==="src") { va=ACTS[a.actKey]?.source||""; vb=ACTS[b.actKey]?.source||""; }
      else { va=""; vb=""; }
      if(va<vb) return sortDir==="asc"?-1:1;
      if(va>vb) return sortDir==="asc"?1:-1;
      return 0;
    });
    return l;
  },[activities,teamF,userSel,srcF,custF,dateFrom,dateTo,sortCol,sortDir,canSeeAll,currentUser]);

  const hasFilter = teamF!=="all"||userSel.length>0||srcF!=="all"||custF||dateFrom||dateTo;
  const reset = ()=>{setTF("all");setUS([]);setSrc("all");setCustF("");setDF("");setDT("");};

  return (
    <div>
      <div style={{ display:"grid",gridTemplateColumns:"240px 1fr",gap:14 }}>
        {/* Filter sidebar */}
        <Card p={16}>
          <div style={{ fontSize:10,fontWeight:700,color:T.textSec,textTransform:"uppercase",letterSpacing:".07em",marginBottom:14 }}>Filter</div>
          <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
            {/* Tim */}
            <div>
              <Lbl>Tim</Lbl>
              {[["all","Semua"],["delivery","Delivery"],["presales","Pre-Sales"]].map(([v,l])=>(
                <button key={v} onClick={()=>{setTF(v);setUS([]);}} style={{ display:"block",width:"100%",padding:"6px 10px",borderRadius:7,border:"none",cursor:"pointer",fontFamily:FONT,fontSize:12,textAlign:"left",marginBottom:3,
                  background:teamF===v?T.indigoLo:T.surfaceHi,color:teamF===v?T.indigoHi:T.textSec,fontWeight:teamF===v?700:400,borderLeft:teamF===v?`2px solid ${T.indigo}`:"2px solid transparent" }}>{l}</button>
              ))}
            </div>
            {/* Source */}
            <div>
              <Lbl>Source</Lbl>
              {[["all","Semua"],["jira","Jira saja"],["nonjira","Non-Jira saja"]].map(([v,l])=>(
                <button key={v} onClick={()=>setSrc(v)} style={{ display:"block",width:"100%",padding:"6px 10px",borderRadius:7,border:"none",cursor:"pointer",fontFamily:FONT,fontSize:12,textAlign:"left",marginBottom:3,
                  background:srcF===v?T.jiraLo:T.surfaceHi,color:srcF===v?T.jira:T.textSec,fontWeight:srcF===v?700:400 }}>{v==="jira"?"◈ ":""}{l}</button>
              ))}
            </div>
            {/* Member — multi-select dropdown */}
            {canSeeAll && (
              <div style={{ position:"relative" }}>
                <Lbl>Member</Lbl>
                <button onClick={()=>setMDD(v=>!v)}
                  style={{ width:"100%",padding:"7px 10px",borderRadius:7,border:`1.5px solid ${memberDDOpen?T.indigo:T.border}`,cursor:"pointer",
                    fontFamily:FONT,fontSize:12,textAlign:"left",background:T.surfaceHi,color:userSel.length>0?T.indigoHi:T.textSec,
                    display:"flex",alignItems:"center",justifyContent:"space-between",transition:"border-color .15s" }}>
                  <span>{userSel.length===0?"Semua member":`${userSel.length} dipilih`}</span>
                  <span style={{ fontSize:10,opacity:.6 }}>{memberDDOpen?"▲":"▼"}</span>
                </button>
                {memberDDOpen && (
                  <div style={{ position:"absolute",top:"100%",left:0,right:0,zIndex:50,marginTop:3,
                    background:T.surface,border:`1.5px solid ${T.indigo}50`,borderRadius:9,
                    boxShadow:"0 8px 24px rgba(0,0,0,.5)",overflow:"hidden" }}>
                    <div style={{ padding:"7px 10px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                      <span style={{ fontSize:10,color:T.textMute,fontWeight:700 }}>PILIH MEMBER</span>
                      {userSel.length>0&&<button onClick={()=>setUS([])} style={{ fontSize:10,color:T.red,background:"none",border:"none",cursor:"pointer",fontFamily:FONT }}>Reset</button>}
                    </div>
                    <div style={{ maxHeight:220,overflowY:"auto" }}>
                      {teamUsers.map(m=>{
                        const sel=userSel.includes(m.name);
                        return (
                          <button key={m.id} onClick={()=>setUS(p=>sel?p.filter(n=>n!==m.name):[...p,m.name])}
                            style={{ width:"100%",display:"flex",alignItems:"center",gap:8,padding:"7px 10px",border:"none",
                              cursor:"pointer",fontFamily:FONT,fontSize:12,textAlign:"left",
                              background:sel?T.indigoLo:T.surface,color:sel?T.indigoHi:T.textSec,
                              borderLeft:`3px solid ${sel?T.indigo:"transparent"}`,transition:"all .1s" }}>
                            <Avi av={m.avatar} team={m.team} sz={20} />
                            <div style={{ flex:1,overflow:"hidden" }}>
                              <div style={{ fontSize:12,fontWeight:sel?700:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{m.name}</div>
                              <div style={{ fontSize:9,color:T.textMute }}>{ROLES[m.role]?.label}</div>
                            </div>
                            {sel&&<span style={{ fontSize:11,color:T.indigo,flexShrink:0 }}>✓</span>}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ padding:"6px 10px",borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"flex-end" }}>
                      <button onClick={()=>setMDD(false)} style={{ fontSize:11,color:T.indigoHi,background:T.indigoLo,border:`1px solid ${T.indigo}30`,borderRadius:5,padding:"4px 12px",cursor:"pointer",fontFamily:FONT,fontWeight:600 }}>Tutup</button>
                    </div>
                  </div>
                )}
                {userSel.length>0&&(
                  <div style={{ display:"flex",flexWrap:"wrap",gap:4,marginTop:6 }}>
                    {userSel.map(n=>(
                      <span key={n} style={{ fontSize:10,background:T.indigoLo,color:T.indigoHi,border:`1px solid ${T.indigo}30`,borderRadius:12,padding:"2px 8px",display:"inline-flex",alignItems:"center",gap:4 }}>
                        {n.split(" ")[0]}
                        <button onClick={()=>setUS(p=>p.filter(x=>x!==n))} style={{ background:"none",border:"none",color:T.red,cursor:"pointer",fontSize:11,padding:0,lineHeight:1 }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Customer search */}
            <div>
              <Lbl>Customer</Lbl>
              <div style={{ position:"relative" }}>
                <input value={custF} onChange={e=>setCustF(e.target.value)} placeholder="Cari nama customer..."
                  style={{ width:"100%",padding:"6px 28px 6px 9px",borderRadius:7,border:`1.5px solid ${custF?T.indigo:T.border}`,
                    background:T.surfaceHi,color:T.textPri,fontFamily:FONT,fontSize:12,outline:"none",boxSizing:"border-box" }} />
                {custF&&<button onClick={()=>setCustF("")} style={{ position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:T.textMute,cursor:"pointer",fontSize:13,padding:0,lineHeight:1 }}>×</button>}
              </div>
            </div>
            {/* Date */}
            <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
              <Inp label="Dari" type="date" value={dateFrom} onChange={e=>setDF(e.target.value)} />
              <Inp label="Sampai" type="date" value={dateTo} onChange={e=>setDT(e.target.value)} />
            </div>
            {hasFilter&&<Btn v="danger" sz="sm" style={{ width:"100%",justifyContent:"center" }} onClick={reset}>× Reset Filter</Btn>}
            <Divider my={4} />
            <Btn v="teal" sz="sm" style={{ width:"100%",justifyContent:"center" }} onClick={()=>exportCSV(visible,members)}>↓ Export CSV</Btn>
            <Btn v="ghost" sz="sm" style={{ width:"100%",justifyContent:"center" }} onClick={()=>exportPDF(visible,members)}>↓ Export PDF</Btn>
          </div>
        </Card>

        {/* Table */}
        <div>
          <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap" }}>
            <span style={{ fontSize:12,fontWeight:700,color:T.textPri }}>{visible.length} baris</span>
            {[teamF!=="all"&&teamF,...userSel.map(n=>n.split(" ")[0]),srcF!=="all"&&srcF,dateFrom&&`≥${dateFrom}`,dateTo&&`≤${dateTo}`].filter(Boolean).map((f,i)=>(
              <Tag key={i} color={T.indigoHi} lo={T.indigoLo}>{f}</Tag>
            ))}
          </div>
          <Card p={0} style={{ overflow:"hidden" }}>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%",borderCollapse:"collapse",fontSize:12 }}>
                <thead><tr style={{ background:T.surfaceHi }}>
                  {[
                    {label:"Tanggal",    col:"date"},
                    {label:"Member",     col:"user"},
                    {label:"Source",     col:"src"},
                    {label:"Kategori",   col:"cat"},
                    {label:"Aktivitas / Ticket", col:null},
                    {label:"Customer",   col:"cust"},
                    {label:"Waktu",      col:"dur"},
                    {label:"Status",     col:"status"},
                  ].map(({label,col})=>(
                    <th key={label}
                      onClick={col?()=>toggleSort(col):undefined}
                      style={{ padding:"9px 12px",textAlign:"left",fontSize:10,fontWeight:700,textTransform:"uppercase",
                        letterSpacing:".05em",whiteSpace:"nowrap",borderBottom:`1px solid ${T.border}`,
                        cursor:col?"pointer":"default",userSelect:"none",
                        color:col&&sortCol===col?T.indigoHi:T.textMute,
                        background:col&&sortCol===col?`${T.indigo}10`:"transparent",
                        transition:"all .15s" }}>
                      <span style={{ display:"inline-flex",alignItems:"center",gap:4 }}>
                        {label}
                        {col && (
                          <span style={{ fontSize:10,opacity:sortCol===col?1:.3,color:T.indigoHi }}>
                            {sortCol===col?(sortDir==="asc"?"↑":"↓"):"↕"}
                          </span>
                        )}
                      </span>
                    </th>
                  ))}
                </tr></thead>
                <tbody>
                  {visible.length===0&&<tr><td colSpan={8} style={{ padding:"36px",textAlign:"center",color:T.textMute }}>Tidak ada data.</td></tr>}
                  {visible.map((a,i)=>{
                    const def=ACTS[a.actKey]||{}; const done=a.status==="completed";
                    const m=members.find(x=>x.name===a.user);
                    return (
                      <tr key={a.id} style={{ borderBottom:`1px solid ${T.border}`,background:i%2===0?T.surface:T.surfaceHi }}>
                        <td style={{ padding:"8px 12px",color:T.textMute,fontFamily:MONO,fontSize:11 }}>{a.date}</td>
                        <td style={{ padding:"8px 12px" }}><div style={{ display:"flex",alignItems:"center",gap:6 }}>{m&&<Avi av={m.avatar} team={m.team} sz={20} />}<span style={{ color:T.textSec }}>{a.user}</span></div></td>
                        <td style={{ padding:"8px 12px" }}>
                          {def.source==="jira"
                            ? <span style={{ fontSize:11,fontWeight:700,color:T.jira,background:T.jiraLo,padding:"2px 7px",borderRadius:5,fontFamily:MONO }}>◈ Jira</span>
                            : <span style={{ fontSize:11,color:T.textMute }}>App</span>}
                        </td>
                        <td style={{ padding:"8px 12px" }}><span style={{ fontSize:11,fontWeight:700,color:def.color }}>{def.icon} {def.label}</span></td>
                        <td style={{ padding:"8px 12px",color:T.textPri,maxWidth:200 }}>
                          <div style={{ overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                            {a.ticketId&&<span style={{ color:T.jira,fontFamily:MONO,fontSize:10,marginRight:5 }}>{a.ticketId}</span>}
                            {a.ticketTitle||a.topic||a.prName||def.label}
                          </div>
                        </td>
                        <td style={{ padding:"8px 12px",maxWidth:150 }}>
                          {(a.customerName||a.prName) ? (
                            <span style={{ fontSize:11,color:T.textSec,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"block" }}>
                              {a.customerName||a.prName}
                            </span>
                          ) : <span style={{ fontSize:10,color:T.textMute }}>—</span>}
                        </td>
                        <td style={{ padding:"8px 12px",color:T.textSec,fontFamily:MONO,fontSize:11,whiteSpace:"nowrap" }}>
                          <div>{a.startTime&&a.endTime?`${a.startTime}–${a.endTime}`:""}</div>
                          <div style={{ color:T.textMute,fontSize:10 }}>{fmtH(a.dur)}</div>
                        </td>
                        <td style={{ padding:"8px 12px" }}><span style={{ fontSize:11,fontWeight:600,color:done?T.green:T.amber }}>{done?"✓ Selesai":"⏳ Progress"}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
