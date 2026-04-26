import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { T, FONT, MONO, DISPLAY } from '../../theme/tokens';
import { actsFor } from '../../constants/taxonomy';
import { useTaxonomy } from '../../contexts/TaxonomyContext';
import { KPI } from '../../utils/kpi';
import { buildQuarterLabel, currentQuarter } from '../../utils/kpiManual';
import { fmtH } from '../../utils/formatters';
import { Card, Tag } from '../ui/Primitives';
import { ScoreRing, ScoreBar } from '../ui/Score';
import api from '../../lib/api';

function filterByQuarter(acts, q, year) {
  const startEnd = {
    Q1: [`${year}-01-01`, `${year}-03-31`],
    Q2: [`${year}-04-01`, `${year}-06-30`],
    Q3: [`${year}-07-01`, `${year}-09-30`],
    Q4: [`${year}-10-01`, `${year}-12-31`],
  };
  const [start, end] = startEnd[q] || startEnd.Q1;
  return acts.filter((a) => a.date >= start && a.date <= end);
}

function CatBox({ c }) {
  const pct = c.count ? Math.round((c.done / c.count) * 100) : 0;
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

export function PersonalKPI({ user, activities }) {
  const ACTS = useTaxonomy();
  const curYear = new Date().getFullYear();
  const [year, setYear] = useState(curYear);
  const [quarter, setQuarter] = useState(currentQuarter());

  const myAllActs = activities.filter((a) => a.user === user.name);
  const myActs = filterByQuarter(myAllActs, quarter, year);

  const { data, isLoading } = useQuery({
    queryKey: ['manual-kpi', user.id, year, quarter],
    queryFn: async () => {
      const res = await api.get(`/kpi/scorecards/${user.id}`, { params: { year, quarter } });
      return res.data;
    },
    enabled: !!user?.id,
  });

  const catBreak = useMemo(() => {
    const cats = actsFor(user.role, ACTS);
    return Object.entries(cats).map(([k, v]) => {
      const list = myActs.filter((a) => a.actKey === k);
      return { key:k, ...v, count:list.length, done:list.filter((a)=>a.status==="completed").length, mins:list.reduce((s,a)=>s+a.dur,0) };
    }).sort((a, b) => b.mins - a.mins);
  }, [myActs, user.role, ACTS]);

  const jiraCats = catBreak.filter((c) => c.source === 'jira');
  const nonJiraCats = catBreak.filter((c) => c.source === 'app');
  const totalMins = myActs.reduce((s, a) => s + a.dur, 0);
  const totalActs = myActs.length;
  const doneActs = myActs.filter((a) => a.status === 'completed').length;
  const jiraMins = myActs.filter((a) => ACTS[a.actKey]?.source === 'jira').reduce((s, a) => s + a.dur, 0);

  const scorecard = data?.scorecard;
  const profile = data?.profile;
  const finalScore = scorecard?.finalScore ?? null;
  const hasScorecard = !data?.unsupported && !!profile;

  return (
    <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
      <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
        <span style={{ fontSize:11,color:T.textMute,fontWeight:600,letterSpacing:".04em",textTransform:"uppercase" }}>Periode KPI:</span>
        <div style={{ display:"flex",gap:3,background:T.surfaceHi,padding:3,borderRadius:8,border:`1px solid ${T.border}` }}>
          {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
            <button key={q} onClick={()=>setQuarter(q)}
              style={{ padding:"4px 12px",borderRadius:6,border:"none",cursor:"pointer",fontFamily:FONT,fontSize:11,fontWeight:q===quarter?700:400,
                background:q===quarter?T.indigo:"transparent",color:q===quarter?"#fff":T.textMute,transition:"all .15s" }}>
              {q}
            </button>
          ))}
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:3,background:T.surfaceHi,padding:"3px 6px",borderRadius:8,border:`1px solid ${T.border}` }}>
          <button onClick={()=>setYear((v)=>v-1)} style={{ background:"none",border:"none",color:T.textMute,cursor:"pointer",fontSize:13,padding:"0 3px",lineHeight:1 }}>‹</button>
          <span style={{ fontSize:11,fontWeight:700,color:T.textPri,fontFamily:MONO,minWidth:34,textAlign:"center" }}>{year}</span>
          <button onClick={()=>setYear((v)=>v+1)} style={{ background:"none",border:"none",color:T.textMute,cursor:"pointer",fontSize:13,padding:"0 3px",lineHeight:1 }}>›</button>
        </div>
        <span style={{ fontSize:10,color:T.textMute }}>{buildQuarterLabel(year, quarter)}</span>
      </div>

      <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10 }}>
        {[
          { l:"Total Jam Kerja", v:fmtH(totalMins), sub:`${quarter} ${year}`, col:T.indigoHi },
          { l:"Total Aktivitas", v:totalActs, sub:`${doneActs} selesai`, col:T.teal },
          { l:"Aktivitas Jira", v:myActs.filter((a)=>ACTS[a.actKey]?.source==="jira").length, sub:`${fmtH(jiraMins)} jam`, col:T.jira },
          { l:"Non-Jira", v:myActs.filter((a)=>ACTS[a.actKey]?.source==="app").length, sub:"learning, meeting, koordinasi", col:T.amber },
        ].map((s, i) => (
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

      {hasScorecard && (
        <Card p={0} style={{ overflow:"hidden" }} glow={KPI.color(finalScore)}>
          <div style={{ background:`linear-gradient(135deg,${T.surface},${T.surfaceHi})`,padding:"18px 20px",display:"flex",alignItems:"center",gap:18,borderBottom:`1px solid ${T.border}` }}>
            <ScoreRing score={finalScore} size={60} />
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10,color:T.textMute,marginBottom:3,letterSpacing:".05em",textTransform:"uppercase" }}>
                {profile?.label || 'KPI Manual'} — Skor {quarter} {year}
              </div>
              <div style={{ fontSize:16,fontWeight:700,color:KPI.color(finalScore),marginBottom:8,fontFamily:DISPLAY }}>
                {isLoading ? 'Memuat...' : KPI.label(finalScore)}
              </div>
              <div style={{ display:"flex",gap:7,flexWrap:"wrap" }}>
              <Tag color={scorecard?.eligibleBonus ? T.green : T.red} lo={scorecard?.eligibleBonus ? T.greenLo : T.redLo}>
                {scorecard?.eligibleBonus ? 'Eligible QB' : 'Tidak Eligible QB'}
              </Tag>
              <Tag color={scorecard?.qbMultiplier > 0 ? T.teal : T.textMute} lo={scorecard?.qbMultiplier > 0 ? T.tealLo : T.border}>
                QB x{Number(scorecard?.qbMultiplier || 0).toFixed(1)}
              </Tag>
              <Tag color={T.indigoHi} lo={T.indigoLo}>
                {scorecard?.completedJiraTaskCount || 0} task Jira done
              </Tag>
              {scorecard?.hasViolation && <Tag color={T.red} lo={T.redLo}>Ada Pelanggaran</Tag>}
              <Tag color={T.textMute} lo={T.border}>{scorecard?.activeDomainCount || 0} domain aktif</Tag>
              <Tag color={T.indigoHi} lo={T.indigoLo}>Input manual head/admin</Tag>
              </div>
            </div>
          </div>
          <div style={{ padding:"14px 20px",display:"flex",flexDirection:"column",gap:10 }}>
            {(profile?.domains || []).map((domain) => {
              const score = scorecard?.scores?.[domain.key] ?? null;
              return (
                <div key={domain.key} style={{ display:"flex",alignItems:"center",gap:10 }}>
                  <span style={{ fontSize:12,color:T.textSec,width:210,flexShrink:0 }}>
                    {domain.label}
                    <span style={{ display:"block",fontSize:10,color:T.textMute,marginTop:2 }}>{domain.formula}</span>
                  </span>
                  <div style={{ flex:1 }}>
                    {score !== null ? <ScoreBar score={score} /> : <span style={{ fontSize:11,color:T.textMute,fontStyle:"italic" }}>N/A — belum dinilai</span>}
                  </div>
                </div>
              );
            })}
          </div>
          {scorecard?.updatedAt && (
            <div style={{ padding:"0 20px 16px",fontSize:10,color:T.textMute }}>
              Update terakhir: {new Date(scorecard.updatedAt).toLocaleString('id-ID')}
              {scorecard?.qbLastCalculatedAt && (
                <span> · QB terakhir dihitung: {new Date(scorecard.qbLastCalculatedAt).toLocaleString('id-ID')}</span>
              )}
            </div>
          )}
        </Card>
      )}

      <Card p={18}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14 }}>
          <div style={{ fontSize:11,fontWeight:700,color:T.textSec,textTransform:"uppercase",letterSpacing:".07em" }}>
            Task per Kategori — {quarter}
          </div>
          <span style={{ fontSize:10,color:T.textMute }}>{totalActs} total aktivitas</span>
        </div>
        {jiraCats.length > 0 && (
          <div style={{ marginBottom:14 }}>
            <div style={{ display:"flex",alignItems:"center",gap:5,marginBottom:8 }}>
              <div style={{ width:8,height:8,borderRadius:1,background:T.jira }} />
              <span style={{ fontSize:10,color:T.jira,fontWeight:700,letterSpacing:".05em" }}>VIA JIRA</span>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:7 }}>
              {jiraCats.map((c) => <CatBox key={c.key} c={c} />)}
            </div>
          </div>
        )}
        {nonJiraCats.length > 0 && (
          <div>
            <div style={{ display:"flex",alignItems:"center",gap:5,marginBottom:8 }}>
              <div style={{ width:8,height:8,borderRadius:1,background:T.textMute }} />
              <span style={{ fontSize:10,color:T.textMute,fontWeight:700,letterSpacing:".05em" }}>NON-JIRA</span>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:7 }}>
              {nonJiraCats.map((c) => <CatBox key={c.key} c={c} />)}
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
