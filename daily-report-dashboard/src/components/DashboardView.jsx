import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { T, FONT, MONO, DISPLAY } from '../theme/tokens';
import { ROLES, isMgr, isAdmin, teamOf } from '../constants/taxonomy';
import { useTaxonomy } from '../contexts/TaxonomyContext';
import { fmtH, fmtIDR } from '../utils/formatters';
import { calcKPI } from '../utils/kpi';
import { currentQuarter } from '../utils/kpiManual';
import { Card, Avi, RoleBadge, TeamBadge, Tag } from './ui/Primitives';
import { PersonalKPI } from './shared/PersonalKPI';
import api from '../lib/api';

export function DashboardView({ currentUser, activities, members, onAdminEditNps }) {
  const ACTS = useTaxonomy();
  const canSeeTeam = isMgr(currentUser.role);
  const myTeam = teamOf(currentUser.role);
  const isAdminRole = isAdmin(currentUser.role);
  const [tab, setTab] = useState(canSeeTeam ? "overview" : "kpi");
  const [memberDetailId, setMemberDetail] = useState(null);
  const [memberDropOpen, setMDO] = useState(false);

  const dlActs = activities.filter(a=>a.userTeam==="delivery");
  const psActs = activities.filter(a=>a.userTeam==="presales");

  const [metrics, setMetrics] = useState(null);
  const [apilb, setApilb] = useState([]);
  const [topKpi, setTopKpi] = useState(null);
  
  useEffect(() => {
    api.get('/dashboard/metrics').then(res => setMetrics(res.data)).catch(console.error);
    api.get('/dashboard/leaderboard').then(res => setApilb(res.data)).catch(console.error);
  }, [activities]); // simple refresh trigger if activities update globally

  const visibleMembers = useMemo(() => {
    if(!canSeeTeam) return [];
    if(isAdminRole) return members.filter(m=>m.status!=="invited");
    return members.filter(m=>m.supervisorId===currentUser.id||m.id===currentUser.id).filter(m=>m.status!=="invited");
  },[members,canSeeTeam,isAdminRole,currentUser]);

  // Merge leaderboard with apilb for roles/kpi that are calculate locally for now or just use API fully:
  // Using locally computed kpi since calcKPI sits in Frontend.
  const leaderboard = useMemo(() => {
    if(!canSeeTeam) return [];
    return apilb.map(m=>{
      const memObj = members.find(mx=>mx.id===m.id);
      const kpiRes = memObj ? calcKPI(memObj, activities) : null;
      return { ...m, ...memObj, kpi:kpiRes?.final??null };
    });
  },[apilb,activities,visibleMembers,canSeeTeam]);

  const maxMins = leaderboard[0]?.totalHours*60 || 1;
  const activeMembers = members.filter((m) => m.status !== "invited");
  const deliveryCount = activeMembers.filter((m) => m.team === "delivery").length;
  const presalesCount = activeMembers.filter((m) => m.team === "presales").length;
  const topMember = leaderboard[0] || null;
  const avgHours = leaderboard.length ? leaderboard.reduce((sum, row) => sum + (row.totalHours || 0), 0) / leaderboard.length : 0;
  const avgHoursLabel = Number(avgHours || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  useEffect(() => {
    let cancelled = false;
    const loadTopKpi = async () => {
      if (!topMember?.id) {
        setTopKpi(null);
        return;
      }
      try {
        const { data } = await api.get(`/kpi/scorecards/${topMember.id}`, {
          params: { year: new Date().getFullYear(), quarter: currentQuarter() },
        });
        if (!cancelled) {
          setTopKpi(data?.scorecard?.finalScore ?? null);
        }
      } catch {
        if (!cancelled) {
          setTopKpi(topMember?.kpi ?? null);
        }
      }
    };
    loadTopKpi();
    return () => { cancelled = true; };
  }, [topMember?.id, topMember?.kpi]);

  const weeklySeries = useMemo(() => {
    const today = new Date();
    const dayMs = 86400000;
    const days = Array.from({ length: 7 }, (_, idx) => {
      const date = new Date(today.getTime() - (6 - idx) * dayMs);
      const key = date.toISOString().slice(0, 10);
      return {
        key,
        label: date.toLocaleDateString('id-ID', { weekday: 'short' }),
        delivery: 0,
        presales: 0,
      };
    });
    const byKey = new Map(days.map((d) => [d.key, d]));
    for (const act of activities) {
      const slot = byKey.get(act.date);
      if (!slot) continue;
      const hours = (act.dur || 0) / 60;
      if (act.userTeam === 'delivery') slot.delivery += hours;
      if (act.userTeam === 'presales') slot.presales += hours;
    }
    return days.map((d) => ({
      ...d,
      delivery: Number(d.delivery.toFixed(1)),
      presales: Number(d.presales.toFixed(1)),
    }));
  }, [activities]);

  const maxWeekly = Math.max(...weeklySeries.flatMap((d) => [d.delivery, d.presales]), 1);

  const tabs = canSeeTeam
    ? isAdminRole
      ? [{id:"overview",label:"📊 Overview"},{id:"leaderboard",label:"🏆 Leaderboard"},{id:"memberdetail",label:"👤 Detail Member"}]
      : [{id:"overview",label:"📊 Overview"},{id:"leaderboard",label:"🏆 Leaderboard"},{id:"memberdetail",label:"👤 Detail Member"},{id:"kpi",label:"📈 KPI Saya"}]
    : [{id:"kpi",label:"📈 KPI Saya"}];

  const memberDetailUser = visibleMembers.find(m=>m.id===memberDetailId) || visibleMembers[0] || null;

  const overviewStats = [
    { l:"Total Aktivitas",  v:metrics?.totalActivities || 0, s:"seluruh tim", col:T.indigoHi },
    { l:"Total Jam Kerja",  v:metrics ? fmtH(metrics.totalHours*60) : "0j 0m", s:"seluruh karyawan", col:T.teal },
    { l:"Pipeline Value",    v:metrics ? fmtIDR(metrics.pipelineValue) : "Rp 0", s:"Prospek Pre-Sales", col:T.violet },
    { l:"Avg NPS",           v:metrics?.avgNps || 0, s:"Capaian PM", col:T.amber },
  ];

  return (
    <div style={{ position:"relative" }}>
      <style>{`
        .dashboard-tabs {
          display:flex;
          gap:3px;
          margin-bottom:22px;
          background:${T.surfaceHi};
          padding:3px;
          border-radius:10px;
          border:1px solid ${T.border};
          width:fit-content;
          flex-wrap:wrap;
        }
        .dashboard-overview-grid {
          display:grid;
          grid-template-columns:minmax(0,1.35fr) minmax(280px,0.65fr);
          gap:14px;
          align-items:start;
        }
        .dashboard-overview-pair {
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:14px;
        }
        .dashboard-composition-grid {
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(120px,1fr));
          gap:14px;
        }
        .leaderboard-row {
          display:flex;
          align-items:center;
          gap:14px;
          padding:13px 20px;
        }
        @media (max-width: 1180px) {
          .dashboard-overview-grid {
            grid-template-columns:1fr;
          }
        }
        @media (max-width: 760px) {
          .dashboard-overview-pair {
            grid-template-columns:1fr;
          }
          .leaderboard-row {
            align-items:flex-start;
            gap:10px;
            padding:12px 14px;
          }
        }
      `}</style>
      <div className="dashboard-tabs">
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{ padding:"6px 16px",borderRadius:8,fontFamily:FONT,fontSize:12,fontWeight:tab===t.id?700:400,cursor:"pointer",border:"none",
            background:tab===t.id?T.indigo:"transparent",color:tab===t.id?"#fff":T.textSec,transition:"all .15s" }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab==="overview" && (
        <div>
          <Card p={18} style={{ marginBottom:14 }}>
            <div style={{ display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:12,flexWrap:"wrap" }}>
              <div>
                <div style={{ fontSize:11,fontWeight:700,color:T.textSec,textTransform:"uppercase",letterSpacing:".07em",marginBottom:4 }}>Dashboard</div>
                <div style={{ fontSize:16,fontWeight:800,color:T.textPri,fontFamily:DISPLAY }}>Ringkasan operasional tim</div>
              </div>
              <div style={{ fontSize:11,color:T.textMute }}>Klik tab untuk berpindah konteks analitik</div>
            </div>
          </Card>

          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12,marginBottom:14 }}>
            {overviewStats.map((k,i)=>(
              <Card key={i} p={0} glow={k.col} style={{ overflow:"hidden" }}>
                <div style={{ padding:"15px 17px" }}>
                  <div style={{ fontSize:9,fontWeight:700,color:T.textMute,textTransform:"uppercase",letterSpacing:".08em",marginBottom:6 }}>{k.l}</div>
                  <div style={{ fontSize:22,fontWeight:800,color:k.col,fontFamily:MONO,marginBottom:3 }}>{k.v}</div>
                  <div style={{ fontSize:10,color:T.textMute }}>{k.s}</div>
                </div>
                <div style={{ height:2,background:k.col,opacity:.5 }} />
              </Card>
            ))}
          </div>

          <div className="dashboard-overview-grid">
            <div style={{ display:"flex",flexDirection:"column",gap:14, minWidth:0 }}>
              <Card p={18}>
                <div style={{ fontSize:11,fontWeight:700,color:T.textSec,textTransform:"uppercase",letterSpacing:".07em",marginBottom:12 }}>Komposisi Aktivitas — Jira vs Non-Jira</div>
                <div className="dashboard-composition-grid">
                  {leaderboard.slice(0,6).map(m => {
                    const jiraPct = m.totalHours ? Math.round((m.totalHours * 0.7) / m.totalHours * 100) : 0;
                    return (
                      <div key={m.id} style={{ minWidth:0 }}>
                        <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:5 }}>
                          <Avi av={m.avatar} team={m.team} sz={22} />
                          <span style={{ fontSize:11,color:T.textPri,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{m.name.split(" ")[0]}</span>
                        </div>
                        <div style={{ height:64,background:T.surfaceHi,borderRadius:8,overflow:"hidden",display:"flex",flexDirection:"column",justifyContent:"flex-end" }}>
                          <div style={{ height:`${jiraPct}%`,background:T.jira,opacity:.85 }} />
                          <div style={{ height:`${100-jiraPct}%`,background:T.textMute,opacity:.3 }} />
                        </div>
                        <div style={{ fontSize:9,color:T.jira,fontWeight:700,marginTop:3,textAlign:"center",fontFamily:MONO }}>~{jiraPct}% Jira</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display:"flex",gap:14,marginTop:10,flexWrap:"wrap" }}>
                  <div style={{ display:"flex",alignItems:"center",gap:5,fontSize:10,color:T.textMute }}><div style={{ width:10,height:10,borderRadius:2,background:T.jira,opacity:.85 }} /> Jira ticket hours</div>
                  <div style={{ display:"flex",alignItems:"center",gap:5,fontSize:10,color:T.textMute }}><div style={{ width:10,height:10,borderRadius:2,background:T.textMute,opacity:.5 }} /> Non-Jira (learning, meeting, koordinasi)</div>
                </div>
              </Card>

              <div className="dashboard-overview-pair">
                <Card p={18}>
                  <div style={{ fontSize:11,fontWeight:700,color:T.textSec,textTransform:"uppercase",letterSpacing:".07em",marginBottom:12 }}>Delivery — Jam Mingguan</div>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={weeklySeries} barSize={5} barGap={0}>
                      <XAxis dataKey="label" tick={{ fill:T.textMute,fontSize:11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill:T.textMute,fontSize:10 }} axisLine={false} tickLine={false} width={22} />
                      <Tooltip contentStyle={{ background:T.surfaceHi,border:`1px solid ${T.border}`,borderRadius:8,fontSize:11,color:T.textPri }} formatter={(value) => [`${value} jam`, 'Delivery']} />
                      <Bar dataKey="delivery" fill={T.teal} radius={[2,2,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
                <Card p={18}>
                  <div style={{ fontSize:11,fontWeight:700,color:T.textSec,textTransform:"uppercase",letterSpacing:".07em",marginBottom:12 }}>Pre-Sales — Mingguan</div>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={weeklySeries} barSize={5} barGap={0}>
                      <XAxis dataKey="label" tick={{ fill:T.textMute,fontSize:11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill:T.textMute,fontSize:10 }} axisLine={false} tickLine={false} width={22} />
                      <Tooltip contentStyle={{ background:T.surfaceHi,border:`1px solid ${T.border}`,borderRadius:8,fontSize:11,color:T.textPri }} formatter={(value) => [`${value} jam`, 'Pre-Sales']} />
                      <Bar dataKey="presales" fill={T.violet} radius={[2,2,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </div>
            </div>

            <div style={{ display:"flex",flexDirection:"column",gap:14, minWidth:0 }}>
              <Card p={18}>
                <div style={{ fontSize:11,fontWeight:700,color:T.textSec,textTransform:"uppercase",letterSpacing:".07em",marginBottom:12 }}>Snapshot Tim</div>
                <div style={{ display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10 }}>
                  {[
                    { label: "Member aktif", value: activeMembers.length, color: T.indigoHi },
                    { label: "Delivery", value: deliveryCount, color: T.teal },
                    { label: "Pre-Sales", value: presalesCount, color: T.violet },
                    { label: "Rata-rata jam", value: avgHoursLabel, color: T.amber },
                  ].map((item) => (
                    <div key={item.label} style={{ background:T.surfaceHi,border:`1px solid ${item.color}25`,borderRadius:10,padding:"11px 12px" }}>
                      <div style={{ fontSize:10,color:T.textMute,marginBottom:6,textTransform:"uppercase",letterSpacing:".06em" }}>{item.label}</div>
                      <div style={{ fontSize:22,fontWeight:800,color:item.color,fontFamily:MONO }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card p={18}>
                <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12 }}>
                  <div style={{ fontSize:11,fontWeight:700,color:T.textSec,textTransform:"uppercase",letterSpacing:".07em" }}>Top Contributor</div>
                  <span style={{ fontSize:10,color:T.textMute }}>berdasarkan jam kerja</span>
                </div>
                {topMember ? (
                  <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                    <Avi av={topMember.avatar} team={topMember.team} sz={42} />
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ fontSize:14,fontWeight:700,color:T.textPri,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{topMember.name}</div>
                      <div style={{ fontSize:11,color:T.textMute,marginTop:2 }}>{topMember.activitiesCount} aktivitas · {fmtH(topMember.totalHours * 60)}</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:11,color:T.textMute }}>KPI</div>
                      <div style={{ fontSize:14,fontWeight:800,color:topMember.team==="presales"?T.violet:T.teal,fontFamily:MONO }}>
                        {topKpi !== null ? topKpi.toFixed(1) : "—"}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize:12,color:T.textMute }}>Belum ada data leaderboard.</div>
                )}
              </Card>

              <Card p={18}>
                <div style={{ fontSize:11,fontWeight:700,color:T.textSec,textTransform:"uppercase",letterSpacing:".07em",marginBottom:12 }}>Arah Penggunaan</div>
                <div style={{ display:"flex",flexDirection:"column",gap:10,fontSize:12,color:T.textSec,lineHeight:1.6 }}>
                  <div>1. Activity Log untuk detail harian dan filter per member.</div>
                  <div>2. Team Members untuk hierarki dan status tim.</div>
                  <div>3. Profile untuk integrasi Jira, Telegram, dan KPI pribadi.</div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {tab==="leaderboard" && (
        <Card p={0} style={{ overflow:"hidden" }}>
          <div style={{ padding:"13px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between" }}>
            <span style={{ fontSize:13,fontWeight:700,color:T.textPri }}>⏱ Leaderboard Jam Kerja</span>
            <span style={{ fontSize:11,color:T.textMute }}>{leaderboard.length} member aktif</span>
          </div>
          {leaderboard.map((m,i)=>(
            <div key={m.id} className="leaderboard-row" style={{ borderBottom:`1px solid ${T.border}`,background:i===0?`${T.green}08`:T.surface }}>
              <span style={{ fontSize:16,width:24,flexShrink:0,textAlign:"center" }}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}</span>
              <Avi av={m.avatar} team={m.team} sz={36} />
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ display:"flex",alignItems:"center",gap:7,marginBottom:5,flexWrap:"wrap" }}>
                  <span style={{ fontSize:12,fontWeight:i<3?700:400,color:T.textPri,overflow:"hidden",textOverflow:"ellipsis" }}>{m.name}</span>
                  <RoleBadge role={m.role} />
                </div>
                <div style={{ height:5,background:T.border,borderRadius:3,overflow:"hidden",marginBottom:4 }}>
                  <div style={{ height:"100%",borderRadius:3,transition:"width .5s",
                    background:`linear-gradient(90deg,${m.team==="presales"?T.violet:T.teal} 70%, ${T.textMute} 70%)`,
                    width:`${Math.round((m.totalHours * 60)/maxMins*100)}%` }} />
                </div>
                <div style={{ fontSize:10,color:T.textMute,display:"flex",gap:10,flexWrap:"wrap" }}>
                  <span>{m.activitiesCount} aktivitas</span>
                  <span>Eff {m.efficiency}%</span>
                </div>
              </div>
              <div style={{ textAlign:"right",flexShrink:0 }}>
                <div style={{ fontSize:14,fontWeight:800,color:m.team==="presales"?T.violet:T.teal,fontFamily:MONO }}>{fmtH(m.totalHours*60)}</div>
                {m.kpi!==null && (
                  <div style={{ marginTop:4,fontSize:10,fontWeight:700,color:kpiColor(m.kpi),fontFamily:MONO,
                    background:`${kpiColor(m.kpi)}18`,padding:"2px 8px",borderRadius:8,border:`1px solid ${kpiColor(m.kpi)}30` }}>
                    KPI {m.kpi===-1?"-1":m.kpi?.toFixed(1)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}

      {tab==="kpi" && !isAdminRole && (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <JiraScheduleCard user={currentUser} />
          <PersonalKPI user={currentUser} activities={activities} />
        </div>
      )}

      {tab==="memberdetail" && (
        <div>
          <div style={{ position:"relative",marginBottom:20,maxWidth:380 }}>
            <div style={{ fontSize:11,color:T.textMute,marginBottom:6,fontWeight:600,letterSpacing:".04em",textTransform:"uppercase" }}>Pilih Team Member</div>
            <button onClick={()=>setMDO(v=>!v)}
              style={{ width:"100%",padding:"10px 14px",borderRadius:9,border:`1.5px solid ${memberDropOpen?T.indigo:T.border}`,
                cursor:"pointer",fontFamily:FONT,fontSize:13,textAlign:"left",background:T.surface,
                display:"flex",alignItems:"center",gap:10,transition:"border-color .15s" }}>
              {memberDetailUser ? (
                <>
                  <Avi av={memberDetailUser.avatar} team={memberDetailUser.team} sz={28} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13,fontWeight:700,color:T.textPri }}>{memberDetailUser.name}</div>
                    <div style={{ fontSize:10,color:T.textMute }}>{ROLES[memberDetailUser.role]?.label} · {memberDetailUser.position}</div>
                  </div>
                </>
              ) : <span style={{ color:T.textMute }}>Pilih member...</span>}
              <span style={{ fontSize:11,color:T.textMute,flexShrink:0 }}>{memberDropOpen?"▲":"▼"}</span>
            </button>
            {memberDropOpen && (
              <div style={{ position:"absolute",top:"100%",left:0,right:0,zIndex:60,marginTop:4,
                background:T.surface,border:`1.5px solid ${T.indigo}40`,borderRadius:10,
                boxShadow:"0 10px 30px rgba(0,0,0,.6)",overflow:"hidden" }}>
                <div style={{ padding:"7px 12px",borderBottom:`1px solid ${T.border}`,fontSize:10,color:T.textMute,fontWeight:700 }}>
                  {visibleMembers.length} MEMBER — {isAdminRole?"Semua Tim":"Tim Langsung"}
                </div>
                <div style={{ maxHeight:260,overflowY:"auto" }}>
                  {visibleMembers.map(m=>{
                    const sel=m.id===memberDetailId;
                    const mActs=activities.filter(a=>a.user===m.name);
                    return (
                      <button key={m.id} onClick={()=>{ setMemberDetail(m.id); setMDO(false); }}
                        style={{ width:"100%",display:"flex",alignItems:"center",gap:10,padding:"9px 14px",border:"none",
                          cursor:"pointer",fontFamily:FONT,textAlign:"left",
                          background:sel?T.indigoLo:T.surface,
                          borderLeft:`3px solid ${sel?T.indigo:"transparent"}`,
                          borderBottom:`1px solid ${T.border}`,transition:"all .1s" }}>
                        <Avi av={m.avatar} team={m.team} sz={32} />
                        <div style={{ flex:1,minWidth:0 }}>
                          <div style={{ fontSize:12,fontWeight:sel?700:500,color:sel?T.indigoHi:T.textPri }}>{m.name}</div>
                          <div style={{ fontSize:10,color:T.textMute,marginTop:1 }}>{ROLES[m.role]?.label} · {mActs.length} aktivitas</div>
                        </div>
                        <div style={{ textAlign:"right",flexShrink:0 }}>
                          <div style={{ fontSize:11,fontFamily:MONO,color:T.teal,fontWeight:700 }}>{fmtH(mActs.reduce((s,a)=>s+a.dur,0))}</div>
                          {m.status==="suspended"&&<span style={{ fontSize:9,color:T.amber }}>Suspended</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {memberDetailUser ? (
            <div>
              <Card p={20} style={{ marginBottom:14 }}>
                <div style={{ display:"flex",alignItems:"flex-start",gap:16,marginBottom:16 }}>
                  <div style={{ position:"relative" }}>
                    <Avi av={memberDetailUser.avatar} team={memberDetailUser.team} sz={56} />
                    {memberDetailUser.status==="active"&&<div style={{ position:"absolute",bottom:2,right:2,width:10,height:10,borderRadius:"50%",background:T.green,border:`2px solid ${T.surface}` }} />}
                    {memberDetailUser.status==="suspended"&&<div style={{ position:"absolute",bottom:2,right:2,width:10,height:10,borderRadius:"50%",background:T.amber,border:`2px solid ${T.surface}` }} />}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:18,fontWeight:800,color:T.textPri,fontFamily:DISPLAY,marginBottom:2 }}>{memberDetailUser.name}</div>
                    <div style={{ fontSize:12,color:T.textMute,marginBottom:8 }}>{memberDetailUser.email}</div>
                    <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
                      <RoleBadge role={memberDetailUser.role} />
                      <TeamBadge team={memberDetailUser.team} />
                      <Tag
                        color={memberDetailUser.status==="active" ? T.green : memberDetailUser.status==="suspended" ? T.amber : T.indigo}
                        lo={memberDetailUser.status==="active" ? T.greenLo : memberDetailUser.status==="suspended" ? T.amberLo : T.indigoLo}
                      >
                        {memberDetailUser.status==="active" ? "Aktif" : memberDetailUser.status==="suspended" ? "Suspended" : "Invited"}
                      </Tag>
                      {(() => { const sup=members.find(m=>m.id===memberDetailUser.supervisorId); return sup?<Tag color={T.amber} lo={T.amberLo}>👤 {sup.name}</Tag>:null; })()}
                    </div>
                  </div>
                </div>
              </Card>
              <JiraScheduleCard user={memberDetailUser} />
              <PersonalKPI user={memberDetailUser} activities={activities} />
            </div>
          ) : (
            <Card p={30}><div style={{ textAlign:"center",color:T.textMute }}>Tidak ada member yang bisa dilihat.</div></Card>
          )}
        </div>
      )}
    </div>
  );
}

function kpiColor(score) {
  if (score == null) return T.textMute;
  if (score === -1) return T.red;
  if (score >= 3.5) return T.green;
  if (score >= 3) return T.teal;
  if (score >= 2) return T.amber;
  return T.red;
}

function JiraScheduleCard({ user }) {
  const [state, setState] = useState({ loading: false, items: [], missingJiraAccount: false, error: '' });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!user?.id || user?.team !== 'delivery') {
        setState({ loading: false, items: [], missingJiraAccount: false, error: '' });
        return;
      }

      setState((prev) => ({ ...prev, loading: true, error: '' }));
      try {
        const { data } = await api.get(`/dashboard/jira-schedule/${user.id}`);
        if (!cancelled) {
          setState({
            loading: false,
            items: Array.isArray(data?.items) ? data.items : [],
            missingJiraAccount: Boolean(data?.missingJiraAccount),
            error: '',
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            loading: false,
            items: [],
            missingJiraAccount: false,
            error: error?.response?.data?.error || 'Gagal mengambil task schedule dari Jira',
          });
        }
      }
    };

    load();
    return () => { cancelled = true; };
  }, [user?.id, user?.team]);

  if (!user?.id || user?.team !== 'delivery') return null;

  return (
    <Card p={0} style={{ overflow:'hidden' }}>
      <div style={{ padding:'13px 20px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:T.textPri }}>Task Schedule in Next 15 Days - {user.name}</div>
          <div style={{ fontSize:11, color:T.textMute, marginTop:2 }}>Issue Jira aktif berdasarkan due date 15 hari ke depan</div>
        </div>
        <span style={{ fontSize:10, color:T.jira, background:T.jiraLo, padding:'3px 8px', borderRadius:999, border:`1px solid ${T.jira}30`, fontWeight:700 }}>Jira</span>
      </div>

      {state.loading && <div style={{ padding:'18px 20px', fontSize:12, color:T.textMute }}>Memuat task schedule...</div>}
      {!state.loading && state.error && <div style={{ padding:'18px 20px', fontSize:12, color:T.red }}>{state.error}</div>}
      {!state.loading && !state.error && state.missingJiraAccount && (
        <div style={{ padding:'18px 20px', fontSize:12, color:T.textMute }}>User ini belum terhubung ke akun Jira.</div>
      )}
      {!state.loading && !state.error && !state.missingJiraAccount && state.items.length === 0 && (
        <div style={{ padding:'18px 20px', fontSize:12, color:T.textMute }}>Tidak ada task dengan due date dalam 15 hari ke depan.</div>
      )}

      {!state.loading && !state.error && !state.missingJiraAccount && state.items.length > 0 && (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:760 }}>
            <thead>
              <tr style={{ background:T.surfaceHi }}>
                {['Issue Key', 'Summary', 'Project', 'Status', 'Priority', 'Due Date', 'Type'].map((label) => (
                  <th key={label} style={{ textAlign:'left', padding:'11px 14px', fontSize:10, color:T.textMute, textTransform:'uppercase', letterSpacing:'.06em', borderBottom:`1px solid ${T.border}` }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.items.map((item) => (
                <tr key={item.issueId} style={{ borderBottom:`1px solid ${T.border}` }}>
                  <td style={{ padding:'12px 14px', fontSize:12, fontWeight:700, fontFamily:MONO }}>
                    <a href={item.issueUrl} target="_blank" rel="noreferrer" style={{ color:T.jira, textDecoration:'none' }}>{item.issueKey}</a>
                  </td>
                  <td style={{ padding:'12px 14px', fontSize:12, color:T.textPri }}>{item.summary || 'Tanpa summary'}</td>
                  <td style={{ padding:'12px 14px', fontSize:12, color:T.textSec }}>{item.projectName || '—'}</td>
                  <td style={{ padding:'12px 14px', fontSize:12, color:T.textSec }}>{item.statusName || '—'}</td>
                  <td style={{ padding:'12px 14px', fontSize:12, color:T.textSec }}>{item.priorityName || '—'}</td>
                  <td style={{ padding:'12px 14px', fontSize:12, color:T.textPri }}>{item.dueDate ? new Date(item.dueDate).toLocaleDateString('id-ID') : '—'}</td>
                  <td style={{ padding:'12px 14px', fontSize:12, color:T.textSec }}>{item.issueTypeName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
