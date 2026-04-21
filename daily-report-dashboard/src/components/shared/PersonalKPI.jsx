import { useState, useMemo } from 'react';
import { T, FONT, MONO, DISPLAY } from '../../theme/tokens';
import { actsFor } from '../../constants/taxonomy';
import { useTaxonomy } from '../../contexts/TaxonomyContext';
import { KPI, calcKPI } from '../../utils/kpi';
import { fmtH } from '../../utils/formatters';
import { Card, Tag } from '../ui/Primitives';
import { ScoreRing, ScoreBar } from '../ui/Score';

// Quarter date ranges — dynamic based on current year
function buildQuarters(year) {
  const y = year || new Date().getFullYear();
  return {
    Q1: { label:`Q1 ${y} (Jan–Mar)`, start:`${y}-01-01`, end:`${y}-03-31` },
    Q2: { label:`Q2 ${y} (Apr–Jun)`, start:`${y}-04-01`, end:`${y}-06-30` },
    Q3: { label:`Q3 ${y} (Jul–Sep)`, start:`${y}-07-01`, end:`${y}-09-30` },
    Q4: { label:`Q4 ${y} (Okt–Des)`, start:`${y}-10-01`, end:`${y}-12-31` },
  };
}

function filterByQuarter(acts, q, year) {
  const QUARTERS = buildQuarters(year);
  const { start, end } = QUARTERS[q] || QUARTERS.Q1;
  return acts.filter(a => a.date >= start && a.date <= end);
}

function AdminNpsPanel({ acts, onAdminEditNps }) {
  const [editId, setEditId] = useState(null);
  const [npsVal, setNpsVal] = useState(3);
  const pmPres = acts.filter(a=>a.actKey==="pm_presentation");
  
  if(!pmPres.length) return null;
  return (
    <div style={{ marginTop:12,padding:"10px 12px",background:`${T.amber}10`,border:`1px solid ${T.amber}30`,borderRadius:8 }}>
      <div style={{ fontSize:10,fontWeight:700,color:T.amber,letterSpacing:".05em",marginBottom:8 }}>⭐ EDIT NPS (Admin)</div>
      {pmPres.map(a=>(
        <div key={a.id} style={{ display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:`1px solid ${T.border}` }}>
          <div style={{ flex:1,overflow:"hidden" }}>
            <div style={{ fontSize:11,color:T.textPri,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{a.customerName||"—"} · {a.date}</div>
          </div>
          {editId===a.id ? (
            <div style={{ display:"flex",gap:4,alignItems:"center" }}>
              {[0,1,2,3,4].map(n=>(
                <button key={n} onClick={()=>setNpsVal(n)} style={{ width:24,height:24,borderRadius:5,border:`1.5px solid ${npsVal===n?T.indigo:T.border}`,background:npsVal===n?T.indigoLo:T.surfaceHi,color:npsVal===n?T.indigoHi:T.textMute,cursor:"pointer",fontFamily:MONO,fontSize:11,fontWeight:700 }}>{n}</button>
              ))}
              <button onClick={()=>{ onAdminEditNps(a.id,npsVal); setEditId(null); }} style={{ padding:"2px 8px",borderRadius:5,background:T.greenLo,border:`1px solid ${T.green}30`,color:T.green,cursor:"pointer",fontFamily:FONT,fontSize:10,fontWeight:700 }}>✓</button>
              <button onClick={()=>setEditId(null)} style={{ padding:"2px 6px",borderRadius:5,background:T.surfaceHi,border:`1px solid ${T.border}`,color:T.textMute,cursor:"pointer",fontFamily:FONT,fontSize:10 }}>×</button>
            </div>
          ) : (
            <div style={{ display:"flex",alignItems:"center",gap:6 }}>
              <span style={{ fontSize:11,fontFamily:MONO,fontWeight:700,color:a.kpi?.nps!=null?T.green:T.amber }}>
                {a.kpi?.nps!=null?`NPS: ${a.kpi.nps}`:"Belum"}
              </span>
              <button onClick={()=>{ setEditId(a.id); setNpsVal(a.kpi?.nps??3); }} style={{ padding:"2px 8px",borderRadius:5,background:T.amberLo,border:`1px solid ${T.amber}30`,color:T.amber,cursor:"pointer",fontFamily:FONT,fontSize:10,fontWeight:600 }}>Edit</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CatBox({ c }) {
  const pct = c.count ? Math.round(c.done/c.count*100) : 0;
  return (
    <div style={{ background:T.surfaceHi,border:`1px solid ${c.color}25`,borderRadius:9,padding:"11px 13px",position:"relative",overflow:"hidden" }}>
      <div style={{ position:"absolute",top:0,left:0,width:3,bottom:0,background:c.color,borderRadius:"3px 0 0 3px" }} />
      <div style={{ fontSize:14,marginBottom:5 }}>{c.icon}</div>
      <div style={{ fontSize:11,fontWeight:700,color:c.color,marginBottom:6,lineHeight:1.3 }}>{c.label}</div>
      <div style={{ fontSize:20,fontWeight:800,color:T.textPri,fontFamily:MONO,marginBottom:4 }}>{c.count}</div>
      <div style={{ fontSize:10,color:T.textMute,marginBottom:6 }}>{c.done}/{c.count} selesai · {fmtH(c.mins)}</div>
      <div style={{ height:3,background:T.border,borderRadius:2,overflow:"hidden" }}>
        <div style={{ height:"100%",width:`${pct}%`,background:c.color,borderRadius:2,transition:"width .5s" }} />
      </div>
    </div>
  );
}

export function PersonalKPI({ user, activities, isAdminView, onAdminEditNps }) {
  const ACTS = useTaxonomy();
  const curYear = new Date().getFullYear();
  const [year, setYear]    = useState(curYear);
  const [quarter, setQuarter] = useState(() => {
    const m = new Date().getMonth(); // 0-indexed
    return m<3?"Q1":m<6?"Q2":m<9?"Q3":"Q4";
  });
  const QUARTERS = buildQuarters(year);
  const myAllActs = activities.filter(a => a.user === user.name);
  const myActs = filterByQuarter(myAllActs, quarter, year);

  const kpi = useMemo(() => calcKPI(user, myActs), [user, myActs]);

  // Cat breakdown for selected quarter
  const catBreak = useMemo(() => {
    const cats = actsFor(user.role, ACTS);
    return Object.entries(cats).map(([k,v]) => {
      const list = myActs.filter(a=>a.actKey===k);
      return { key:k, ...v, count:list.length, done:list.filter(a=>a.status==="completed").length, mins:list.reduce((s,a)=>s+a.dur,0) };
    }).sort((a,b)=>b.mins-a.mins);
  }, [myActs, user.role, ACTS]);

  const jiraCats    = catBreak.filter(c => c.source === "jira");
  const nonJiraCats = catBreak.filter(c => c.source === "app");

  // Stats: total jam, total aktivitas, selesai
  const totalMins  = myActs.reduce((s,a)=>s+a.dur,0);
  const totalActs  = myActs.length;
  const doneActs   = myActs.filter(a=>a.status==="completed").length;
  const jiraMins   = myActs.filter(a=>ACTS[a.actKey]?.source==="jira").reduce((s,a)=>s+a.dur,0);

  const isSE = user.role === "delivery";
  const isPMRole = user.role === "pm";

  return (
    <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
      {/* Quarter + Year Selector */}
      <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
        <span style={{ fontSize:11,color:T.textMute,fontWeight:600,letterSpacing:".04em",textTransform:"uppercase" }}>Periode KPI:</span>
        <div style={{ display:"flex",gap:3,background:T.surfaceHi,padding:3,borderRadius:8,border:`1px solid ${T.border}` }}>
          {["Q1","Q2","Q3","Q4"].map(q=>(
            <button key={q} onClick={()=>setQuarter(q)}
              style={{ padding:"4px 12px",borderRadius:6,border:"none",cursor:"pointer",fontFamily:FONT,fontSize:11,fontWeight:q===quarter?700:400,
                background:q===quarter?T.indigo:"transparent",color:q===quarter?"#fff":T.textMute,transition:"all .15s" }}>
              {q}
            </button>
          ))}
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:3,background:T.surfaceHi,padding:"3px 6px",borderRadius:8,border:`1px solid ${T.border}` }}>
          <button onClick={()=>setYear(y=>y-1)} style={{ background:"none",border:"none",color:T.textMute,cursor:"pointer",fontSize:13,padding:"0 3px",lineHeight:1 }}>‹</button>
          <span style={{ fontSize:11,fontWeight:700,color:T.textPri,fontFamily:MONO,minWidth:34,textAlign:"center" }}>{year}</span>
          <button onClick={()=>setYear(y=>y+1)} style={{ background:"none",border:"none",color:T.textMute,cursor:"pointer",fontSize:13,padding:"0 3px",lineHeight:1 }}>›</button>
        </div>
        <span style={{ fontSize:10,color:T.textMute }}>{QUARTERS[quarter]?.label}</span>
      </div>

      {/* Stats Row: total jam + aktivitas breakdown */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10 }}>
        {[
          { l:"Total Jam Kerja",   v:fmtH(totalMins),   sub:`${quarter} ${new Date().getFullYear()}`, col:T.indigoHi },
          { l:"Total Aktivitas",   v:totalActs,          sub:`${doneActs} selesai`,                   col:T.teal },
          { l:"Aktivitas Jira",    v:myActs.filter(a=>ACTS[a.actKey]?.source==="jira").length, sub:`${fmtH(jiraMins)} jam`, col:T.jira },
          { l:"Non-Jira",          v:myActs.filter(a=>ACTS[a.actKey]?.source==="app").length,  sub:"learning, mtg, dll",   col:T.amber },
        ].map((s,i)=>(
          <Card key={i} p={0} style={{ overflow:"hidden" }}>
            <div style={{ padding:"12px 14px" }}>
              <div style={{ fontSize:9,fontWeight:700,color:T.textMute,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5 }}>{s.l}</div>
              <div style={{ fontSize:22,fontWeight:800,color:s.col,fontFamily:MONO,marginBottom:2 }}>{s.v}</div>
              <div style={{ fontSize:10,color:T.textMute }}>{s.sub}</div>
            </div>
            <div style={{ height:2,background:s.col,opacity:.4 }} />
          </Card>
        ))}
      </div>

      {/* KPI Score card — hanya untuk SE dan PM */}
      {kpi ? (
        <Card p={0} style={{ overflow:"hidden" }} glow={KPI.color(kpi.final)}>
          <div style={{ background:`linear-gradient(135deg,${T.surface},${T.surfaceHi})`,padding:"18px 20px",display:"flex",alignItems:"center",gap:18,borderBottom:`1px solid ${T.border}` }}>
            <ScoreRing score={kpi.final} size={60} />
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10,color:T.textMute,marginBottom:3,letterSpacing:".05em",textTransform:"uppercase" }}>
                {isPMRole?"PD-002 · Project Manager":"PD-001 · Service Engineer"} — Skor KPI {quarter} {year}
              </div>
              <div style={{ fontSize:16,fontWeight:700,color:KPI.color(kpi.final),marginBottom:8,fontFamily:DISPLAY }}>{KPI.label(kpi.final)}</div>
              <div style={{ display:"flex",gap:7,flexWrap:"wrap" }}>
                {(() => { const qb=KPI.eligible(kpi.final); return <Tag color={qb?T.green:T.red} lo={qb?T.greenLo:T.redLo}>{qb?"✓ Eligible QB":"✗ Tidak Eligible QB"}</Tag>; })()}
                {kpi.final===-1 && <Tag color={T.red} lo={T.redLo}>⚠ Ada Pelanggaran</Tag>}
                <Tag color={T.textMute} lo={T.border}>{kpi.domains.filter(d=>d.score!==null).length} domain aktif</Tag>
              </div>
            </div>
          </div>
          {/* Domain Scores */}
          <div style={{ padding:"14px 20px",display:"flex",flexDirection:"column",gap:10 }}>
            {kpi.domains.map((d,i) => (
              <div key={i} style={{ display:"flex",alignItems:"center",gap:10 }}>
                <span style={{ fontSize:12,color:T.textSec,width:175,flexShrink:0 }}>{d.label}</span>
                <div style={{ flex:1 }}>
                  {d.score!==null ? <ScoreBar score={d.score} /> : <span style={{ fontSize:11,color:T.textMute,fontStyle:"italic" }}>N/A — belum ada data</span>}
                </div>
                <span style={{ fontSize:11,color:T.textMute,width:65,textAlign:"right",flexShrink:0 }}>{d.count} aktivitas</span>
              </div>
            ))}
          </div>
          {/* Admin NPS edit panel for pm_presentation */}
          {isAdminView && onAdminEditNps && (
            <div style={{ padding:"0 16px 12px" }}>
              <AdminNpsPanel acts={myActs} onAdminEditNps={onAdminEditNps} />
            </div>
          )}
          {/* NPS pending notice */}
          {!isAdminView && (() => {
            const needNPS = myActs.filter(a=>a.actKey==="pm_presentation"&&a.kpi?.nps==null);
            return needNPS.length>0 ? (
              <div style={{ margin:"0 16px 12px",padding:"8px 12px",background:T.amberLo,border:`1px solid ${T.amber}30`,borderRadius:7,fontSize:11,color:T.amber,display:"flex",alignItems:"center",gap:6 }}>
                ⚠ {needNPS.length} PM Presentation belum ada skor NPS. Hubungi Admin.
              </div>
            ) : null;
          })()}
        </Card>
      ) : (
        totalActs === 0 ? (
          <Card p={20}>
            <div style={{ textAlign:"center",color:T.textMute,fontSize:13 }}>Belum ada aktivitas di {quarter} {year}.</div>
          </Card>
        ) : null
      )}

      {/* Task per kategori — grid card setiap kategori */}
      <Card p={18}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14 }}>
          <div style={{ fontSize:11,fontWeight:700,color:T.textSec,textTransform:"uppercase",letterSpacing:".07em" }}>
            Task per Kategori — {quarter}
          </div>
          <span style={{ fontSize:10,color:T.textMute }}>{totalActs} total aktivitas</span>
        </div>
        {/* Jira section */}
        {jiraCats.length > 0 && (
          <div style={{ marginBottom:14 }}>
            <div style={{ display:"flex",alignItems:"center",gap:5,marginBottom:8 }}>
              <div style={{ width:8,height:8,borderRadius:1,background:T.jira }} />
              <span style={{ fontSize:10,color:T.jira,fontWeight:700,letterSpacing:".05em" }}>VIA JIRA</span>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:7 }}>
              {jiraCats.map(c => <CatBox key={c.key} c={c} />)}
            </div>
          </div>
        )}
        {/* Non-Jira section */}
        {nonJiraCats.length > 0 && (
          <div>
            <div style={{ display:"flex",alignItems:"center",gap:5,marginBottom:8 }}>
              <div style={{ width:8,height:8,borderRadius:1,background:T.textMute }} />
              <span style={{ fontSize:10,color:T.textMute,fontWeight:700,letterSpacing:".05em" }}>NON-JIRA</span>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:7 }}>
              {nonJiraCats.map(c => <CatBox key={c.key} c={c} />)}
            </div>
          </div>
        )}
        {totalActs === 0 && (
          <div style={{ textAlign:"center",color:T.textMute,fontSize:13,padding:"24px 0" }}>Belum ada aktivitas di {quarter} {year}.</div>
        )}
      </Card>
    </div>
  );
}
