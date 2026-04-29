import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { T, FONT, MONO, DISPLAY } from '../theme/tokens';
import { ROLES } from '../constants/taxonomy';
import { KPI } from '../utils/kpi';
import { buildQuarterLabel, computeManualSummary, currentQuarter } from '../utils/kpiManual';
import { Btn, Card, Inp, Lbl, RoleBadge, Tag } from './ui/Primitives';
import { ScoreRing, ScoreBar } from './ui/Score';
import api from '../lib/api';

function avgScores(values) {
  const filtered = values.filter((value) => value !== null && value !== undefined);
  if (!filtered.length) return null;
  if (filtered.some((value) => value === -1)) return -1;
  return Number((filtered.reduce((sum, value) => sum + value, 0) / filtered.length).toFixed(2));
}

function hasAutoEvidence(values) {
  return values.some((value) => value !== null && value !== undefined);
}

function normalizeManualValue(value, fallback = null) {
  if (value === '' || value === null || value === undefined) return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function summarizeScoreMap(profile, scores = {}, completedJiraTaskCount = 0) {
  return computeManualSummary(profile, scores, completedJiraTaskCount);
}

function computeEngineerDeliveryPreview(scorecardData, manualInputs) {
  const scorecard = scorecardData?.scorecard;
  const profile = scorecardData?.profile;
  if (!scorecard || !profile) {
    return summarizeScoreMap(profile, {}, 0);
  }

  const breakdown = scorecard.breakdown || {};
  const implAutoScores = [
    breakdown.impl?.components?.taskAccuracy?.score ?? null,
    breakdown.impl?.components?.documentation?.score ?? null,
  ];
  const pmAutoScores = [
    breakdown.pm?.components?.execution?.score ?? null,
    breakdown.pm?.components?.report?.score ?? null,
  ];
  const nextScores = {
    impl: hasAutoEvidence(implAutoScores)
      ? avgScores([...implAutoScores, normalizeManualValue(manualInputs.implNps, scorecard.manualInputs?.implNps ?? 3)])
      : null,
    pm: hasAutoEvidence(pmAutoScores)
      ? avgScores([...pmAutoScores, normalizeManualValue(manualInputs.pmNps, scorecard.manualInputs?.pmNps ?? 3)])
      : null,
    cm: scorecard.scores?.cm ?? null,
    enh: scorecard.scores?.enh ?? null,
    ops: normalizeManualValue(manualInputs.opsScore, scorecard.manualInputs?.opsScore ?? null),
  };

  return summarizeScoreMap(profile, nextScores, scorecard.completedJiraTaskCount || 0);
}

function HybridMetric({ label, score, detail }) {
  return (
    <div style={{ background:T.surfaceHi,border:`1px solid ${T.border}`,borderRadius:9,padding:'10px 11px' }}>
      <div style={{ display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',marginBottom:5 }}>
        <div style={{ fontSize:11,fontWeight:700,color:T.textPri }}>{label}</div>
        <Tag color={KPI.color(score)} lo={T.border}>{score === null ? 'N/A' : String(score)}</Tag>
      </div>
      <div style={{ fontSize:10,color:T.textMute,lineHeight:1.45 }}>{detail}</div>
    </div>
  );
}

function DetailCell({ value }) {
  return <span>{value === null || value === undefined || value === '' ? '—' : String(value)}</span>;
}

function HybridDetailsTable({ title, columns, rows }) {
  if (!rows?.length) return null;
  return (
    <details style={{ marginTop:10,background:T.bg,border:`1px solid ${T.border}`,borderRadius:9,overflow:'hidden' }}>
      <summary style={{ cursor:'pointer',listStyle:'none',padding:'10px 12px',fontSize:11,fontWeight:700,color:T.textPri }}>
        {title} ({rows.length})
      </summary>
      <div style={{ overflowX:'auto',borderTop:`1px solid ${T.border}` }}>
        <table style={{ width:'100%',borderCollapse:'collapse',fontSize:10,color:T.textPri }}>
          <thead>
            <tr style={{ background:T.surfaceHi }}>
              {columns.map((column) => (
                <th key={column.key} style={{ textAlign:'left',padding:'8px 10px',borderBottom:`1px solid ${T.border}`,whiteSpace:'nowrap' }}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.id || row.issueKey || row.parentRef || idx}>
                {columns.map((column) => (
                  <td key={column.key} style={{ padding:'8px 10px',borderBottom:`1px solid ${T.border}`,verticalAlign:'top',whiteSpace:'nowrap' }}>
                    <DetailCell value={typeof column.render === 'function' ? column.render(row) : row[column.key]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function KpiManagementView({ currentUser }) {
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [quarter, setQuarter] = useState(currentQuarter());
  const [selectedUserId, setSelectedUserId] = useState('');
  const [scores, setScores] = useState({});
  const [notes, setNotes] = useState({});
  const [manualInputs, setManualInputs] = useState({ implNps: 3, pmNps: 3, opsScore: '' });

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['kpi-users'],
    queryFn: async () => {
      const res = await api.get('/kpi/users');
      return res.data;
    },
  });

  useEffect(() => {
    if (!selectedUserId && users.length) {
      const preferred = users.find((u) => !!u.kpiProfile) || users[0];
      setSelectedUserId(preferred?.id || '');
    }
  }, [users, selectedUserId]);

  const { data: scorecardData, isLoading: loadingScorecard } = useQuery({
    queryKey: ['kpi-scorecard', selectedUserId, year, quarter],
    queryFn: async () => {
      const res = await api.get(`/kpi/scorecards/${selectedUserId}`, { params: { year, quarter } });
      return res.data;
    },
    enabled: !!selectedUserId,
  });

  useEffect(() => {
    if (!scorecardData?.scorecard) return;
    setScores(scorecardData.scorecard.scores || {});
    setNotes(scorecardData.scorecard.notes || {});
    setManualInputs({
      implNps: scorecardData.scorecard.manualInputs?.implNps ?? 3,
      pmNps: scorecardData.scorecard.manualInputs?.pmNps ?? 3,
      opsScore: scorecardData.scorecard.manualInputs?.opsScore ?? '',
    });
  }, [scorecardData]);

  const isEngineerDelivery = scorecardData?.profile?.key === 'engineer_delivery';

  const preview = useMemo(() => {
    if (isEngineerDelivery) {
      return computeEngineerDeliveryPreview(scorecardData, manualInputs);
    }
    return computeManualSummary(scorecardData?.profile, scores, scorecardData?.scorecard?.completedJiraTaskCount || 0);
  }, [isEngineerDelivery, manualInputs, scorecardData, scores]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = isEngineerDelivery
        ? {
            year,
            quarter,
            manualInputs: {
              implNps: manualInputs.implNps === '' ? null : Number(manualInputs.implNps),
              pmNps: manualInputs.pmNps === '' ? null : Number(manualInputs.pmNps),
              opsScore: manualInputs.opsScore === '' ? null : Number(manualInputs.opsScore),
            },
            notes,
          }
        : {
            year,
            quarter,
            scores: Object.fromEntries(
              Object.entries(scores).map(([key, value]) => [key, value === '' ? null : Number(value)])
            ),
            notes,
          };
      const res = await api.put(`/kpi/scorecards/${selectedUserId}`, payload);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success('KPI manual berhasil disimpan.');
      queryClient.setQueryData(['kpi-scorecard', selectedUserId, year, quarter], data);
      queryClient.invalidateQueries({ queryKey: ['manual-kpi', selectedUserId, year, quarter] });
    },
    onError: (error) => {
      toast.error(error?.response?.data?.error || 'Gagal menyimpan KPI manual.');
    },
  });

  const triggerQbMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/kpi/scorecards/${selectedUserId}/recalculate-qb`, {
        year,
        quarter,
      });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success('Aktivitas Jira untuk QB berhasil dihitung ulang.');
      queryClient.setQueryData(['kpi-scorecard', selectedUserId, year, quarter], data);
      queryClient.invalidateQueries({ queryKey: ['manual-kpi', selectedUserId, year, quarter] });
    },
    onError: (error) => {
      toast.error(error?.response?.data?.error || 'Gagal menghitung aktivitas Jira untuk QB.');
    },
  });

  const selectedUser = scorecardData?.user || users.find((u) => u.id === selectedUserId) || null;
  const profile = scorecardData?.profile || null;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <Card p={18}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:16, flexWrap:'wrap', alignItems:'flex-start' }}>
            <div>
              <div style={{ fontSize:10,color:T.textMute,marginBottom:4,textTransform:'uppercase',letterSpacing:'.07em' }}>
                Input KPI
              </div>
              <div style={{ fontSize:18,fontWeight:800,color:T.textPri,fontFamily:DISPLAY,marginBottom:6 }}>
                {isEngineerDelivery ? 'Hybrid KPI Automation' : 'Admin / Head Scoring'}
              </div>
              <div style={{ fontSize:12,color:T.textMute,maxWidth:640 }}>
                {isEngineerDelivery
                  ? 'Engineer Delivery memakai kalkulasi otomatis dari evidence Jira. Input manual hanya tersisa untuk NPS domain terkait dan skor Operational.'
                  : 'Nilai per domain diinput manual. Sistem hanya menghitung rata-rata domain aktif, pelanggaran, dan status bonus.'}
              </div>
            </div>
          <Tag color={T.indigoHi} lo={T.indigoLo}>
            {ROLES[currentUser.role]?.label || currentUser.role}
          </Tag>
        </div>
      </Card>

      <Card p={18}>
        <div style={{ display:'grid', gridTemplateColumns:'minmax(260px,1.2fr) minmax(220px,.8fr)', gap:14 }}>
          <div>
            <Lbl>User</Lbl>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              style={{ width:'100%',background:T.surfaceHi,border:`1.5px solid ${T.border}`,borderRadius:8,padding:'10px 12px',color:T.textPri,fontSize:12,outline:'none',fontFamily:FONT }}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({ROLES[u.role]?.label || u.role})
                </option>
              ))}
            </select>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <Lbl>Quarter</Lbl>
              <div style={{ display:'flex',gap:3,background:T.surfaceHi,padding:3,borderRadius:8,border:`1px solid ${T.border}` }}>
                {['Q1','Q2','Q3','Q4'].map((q)=>(
                  <button key={q} onClick={()=>setQuarter(q)} style={{ flex:1,padding:'6px 10px',borderRadius:6,border:'none',cursor:'pointer',fontFamily:FONT,fontSize:11,fontWeight:q===quarter?700:400,background:q===quarter?T.indigo:'transparent',color:q===quarter?'#fff':T.textMute }}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Lbl>Year</Lbl>
              <div style={{ display:'flex',alignItems:'center',gap:3,background:T.surfaceHi,padding:'5px 6px',borderRadius:8,border:`1px solid ${T.border}` }}>
                <button onClick={()=>setYear((v)=>v-1)} style={{ background:'none',border:'none',color:T.textMute,cursor:'pointer',fontSize:13 }}>‹</button>
                <span style={{ flex:1,textAlign:'center',fontSize:12,fontWeight:700,color:T.textPri,fontFamily:MONO }}>{year}</span>
                <button onClick={()=>setYear((v)=>v+1)} style={{ background:'none',border:'none',color:T.textMute,cursor:'pointer',fontSize:13 }}>›</button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {!loadingUsers && !users.length && (
        <Card p={18}>
          <div style={{ fontSize:12,color:T.textMute }}>Tidak ada user yang bisa dinilai dari akun ini.</div>
        </Card>
      )}

      {selectedUser && (
        <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1.5fr) minmax(320px,.9fr)', gap:16, alignItems:'start' }}>
          <Card p={18}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14 }}>
              <div>
                <div style={{ fontSize:16,fontWeight:700,color:T.textPri }}>{selectedUser.name}</div>
                <div style={{ fontSize:11,color:T.textMute,marginTop:2 }}>{selectedUser.email}</div>
              </div>
              <div style={{ display:'flex',gap:6,flexWrap:'wrap',justifyContent:'flex-end' }}>
                <RoleBadge role={selectedUser.role} />
                {selectedUser.team === 'delivery' && <Tag color={T.teal} lo={T.tealLo}>Delivery</Tag>}
                {selectedUser.team === 'presales' && <Tag color={T.violet} lo={T.violetLo}>Pre-Sales</Tag>}
              </div>
            </div>

            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:14,padding:'10px 12px',background:T.surfaceHi,border:`1px solid ${T.border}`,borderRadius:10 }}>
              <div>
                <div style={{ fontSize:11,fontWeight:700,color:T.textPri,marginBottom:3 }}>Trigger Aktivitas Jira untuk QB</div>
                <div style={{ fontSize:11,color:T.textMute }}>
                  Hitung task Jira <strong style={{ color:T.textPri }}>done</strong> pada quarter ini. Yang dihitung: `[IMP]`, `[MA]`, `[OPS]`, dan `(SUP)` non-subtask/non-epic.
                </div>
              </div>
              <Btn v="sec" onClick={()=>triggerQbMutation.mutate()} disabled={triggerQbMutation.isPending}>
                {triggerQbMutation.isPending ? 'Menghitung...' : 'Trigger Hitung Jira'}
              </Btn>
            </div>

            {loadingScorecard ? (
              <div style={{ fontSize:12,color:T.textMute }}>Memuat scorecard...</div>
            ) : scorecardData?.unsupported ? (
              <div style={{ fontSize:12,color:T.textMute }}>Role ini belum punya template KPI manual.</div>
            ) : (
              <div style={{ display:'flex',flexDirection:'column',gap:14 }}>
                {isEngineerDelivery ? (
                  <>
                    {scorecardData?.scorecard?.automationWarnings?.length > 0 && (
                      <div style={{ padding:'10px 12px',borderRadius:10,background:T.redLo,border:`1px solid ${T.red}35`,fontSize:11,color:T.textPri }}>
                        {scorecardData.scorecard.automationWarnings.join(' ')}
                      </div>
                    )}

                    <div style={{ background:T.surfaceHi,border:`1px solid ${T.border}`,borderRadius:10,padding:'13px 14px' }}>
                      <div style={{ display:'flex',justifyContent:'space-between',gap:12,alignItems:'start',marginBottom:10 }}>
                        <div>
                          <div style={{ fontSize:13,fontWeight:700,color:T.textPri }}>KPI Implementasi</div>
                          <div style={{ fontSize:11,color:T.textMute,marginTop:3 }}>(Task Accuracy + Dokumentasi + NPS) / 3</div>
                        </div>
                        <div style={{ width:120 }}>
                          <Inp label="NPS" type="number" min="-1" max="4" step="0.01" value={manualInputs.implNps ?? ''} onChange={(e)=>setManualInputs((prev)=>({ ...prev, implNps: e.target.value }))} mono />
                        </div>
                      </div>
                      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10 }}>
                        <HybridMetric
                          label="Task Accuracy"
                          score={scorecardData?.scorecard?.breakdown?.impl?.components?.taskAccuracy?.score ?? null}
                          detail={`${scorecardData?.scorecard?.breakdown?.impl?.components?.taskAccuracy?.onTimeSubtaskCount || 0}/${scorecardData?.scorecard?.breakdown?.impl?.components?.taskAccuracy?.eligibleSubtaskCount || 0} subtask tepat waktu · ${scorecardData?.scorecard?.breakdown?.impl?.components?.taskAccuracy?.onTimePct ?? 'N/A'}%`}
                        />
                        <HybridMetric
                          label="Dokumentasi"
                          score={scorecardData?.scorecard?.breakdown?.impl?.components?.documentation?.score ?? null}
                          detail={`${scorecardData?.scorecard?.breakdown?.impl?.components?.documentation?.foundDocCount || 0}/${scorecardData?.scorecard?.breakdown?.impl?.components?.documentation?.expectedDocCount || 5} dokumen ditemukan · ${scorecardData?.scorecard?.breakdown?.impl?.components?.documentation?.lateDocCount || 0} terlambat`}
                        />
                      </div>
                      <HybridDetailsTable
                        title="Detail subtask task accuracy"
                        columns={[
                          { key:'issueKey', label:'Issue' },
                          { key:'dueDate', label:'Due Date' },
                          { key:'doneAt', label:'Done At' },
                          { key:'status', label:'Status' },
                        ]}
                        rows={(scorecardData?.scorecard?.breakdown?.impl?.components?.taskAccuracy?.items || []).map((item) => ({
                          ...item,
                          status: item.doneAt ? (item.onTime ? 'On time' : 'Late') : 'Open',
                        }))}
                      />
                      <HybridDetailsTable
                        title="Detail dokumentasi"
                        columns={[
                          { key:'name', label:'Dokumen' },
                          { key:'present', label:'Ada', render: (row) => row.present ? 'Ya' : 'Tidak' },
                          { key:'onTime', label:'On Time', render: (row) => row.present ? (row.onTime ? 'Ya' : 'Tidak') : '—' },
                        ]}
                        rows={scorecardData?.scorecard?.breakdown?.impl?.components?.documentation?.matchedDocs || []}
                      />
                      <Inp label="Catatan" value={notes?.impl ?? ''} onChange={(e)=>setNotes((prev)=>({ ...prev, impl: e.target.value }))} placeholder="Opsional" />
                    </div>

                    <div style={{ background:T.surfaceHi,border:`1px solid ${T.border}`,borderRadius:10,padding:'13px 14px' }}>
                      <div style={{ display:'flex',justifyContent:'space-between',gap:12,alignItems:'start',marginBottom:10 }}>
                        <div>
                          <div style={{ fontSize:13,fontWeight:700,color:T.textPri }}>KPI Preventive Maintenance</div>
                          <div style={{ fontSize:11,color:T.textMute,marginTop:3 }}>(Pelaksanaan PM + Report PM + NPS) / 3</div>
                        </div>
                        <div style={{ width:120 }}>
                          <Inp label="NPS" type="number" min="-1" max="4" step="0.01" value={manualInputs.pmNps ?? ''} onChange={(e)=>setManualInputs((prev)=>({ ...prev, pmNps: e.target.value }))} mono />
                        </div>
                      </div>
                      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10 }}>
                        <HybridMetric
                          label="Pelaksanaan PM"
                          score={scorecardData?.scorecard?.breakdown?.pm?.components?.execution?.score ?? null}
                          detail={`${scorecardData?.scorecard?.breakdown?.pm?.components?.execution?.itemCount || 0} item parent PM tervalidasi`}
                        />
                        <HybridMetric
                          label="Report PM"
                          score={scorecardData?.scorecard?.breakdown?.pm?.components?.report?.score ?? null}
                          detail={`${scorecardData?.scorecard?.breakdown?.pm?.components?.report?.itemCount || 0} report dibandingkan dengan actual PM`}
                        />
                      </div>
                      <HybridDetailsTable
                        title="Detail pelaksanaan PM"
                        columns={[
                          { key:'parentRef', label:'Parent' },
                          { key:'issueKey', label:'Issue' },
                          { key:'dueDate', label:'Due Date' },
                          { key:'doneAt', label:'Done At' },
                          { key:'lateDays', label:'Late (days)' },
                          { key:'score', label:'Skor' },
                        ]}
                        rows={scorecardData?.scorecard?.breakdown?.pm?.components?.execution?.items || []}
                      />
                      <HybridDetailsTable
                        title="Detail report PM"
                        columns={[
                          { key:'parentRef', label:'Parent' },
                          { key:'issueKey', label:'Issue' },
                          { key:'actualPmDoneAt', label:'Actual PM Done' },
                          { key:'reportDoneAt', label:'Report Done' },
                          { key:'businessDaysLate', label:'Late (biz days)' },
                          { key:'score', label:'Skor' },
                        ]}
                        rows={scorecardData?.scorecard?.breakdown?.pm?.components?.report?.items || []}
                      />
                      <Inp label="Catatan" value={notes?.pm ?? ''} onChange={(e)=>setNotes((prev)=>({ ...prev, pm: e.target.value }))} placeholder="Opsional" />
                    </div>

                    <div style={{ background:T.surfaceHi,border:`1px solid ${T.border}`,borderRadius:10,padding:'13px 14px' }}>
                      <div style={{ marginBottom:10 }}>
                        <div style={{ fontSize:13,fontWeight:700,color:T.textPri }}>KPI Corrective Maintenance</div>
                        <div style={{ fontSize:11,color:T.textMute,marginTop:3 }}>(Response Time + Resolution Time) / 2</div>
                      </div>
                      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10 }}>
                        <HybridMetric
                          label="Response Time"
                          score={scorecardData?.scorecard?.breakdown?.cm?.components?.response?.score ?? null}
                          detail={`${scorecardData?.scorecard?.breakdown?.cm?.components?.response?.itemCount || 0} issue problem tervalidasi`}
                        />
                        <HybridMetric
                          label="Resolution Time"
                          score={scorecardData?.scorecard?.breakdown?.cm?.components?.resolution?.score ?? null}
                          detail={`${scorecardData?.scorecard?.breakdown?.cm?.components?.resolution?.itemCount || 0} issue problem tervalidasi`}
                        />
                      </div>
                      <HybridDetailsTable
                        title="Detail response CM"
                        columns={[
                          { key:'issueKey', label:'Issue' },
                          { key:'priority', label:'Priority' },
                          { key:'createdAt', label:'Created' },
                          { key:'firstCommentAt', label:'First Response' },
                          { key:'actualMinutes', label:'Minutes' },
                          { key:'score', label:'Skor' },
                        ]}
                        rows={scorecardData?.scorecard?.breakdown?.cm?.components?.response?.items || []}
                      />
                      <HybridDetailsTable
                        title="Detail resolution CM"
                        columns={[
                          { key:'issueKey', label:'Issue' },
                          { key:'priority', label:'Priority' },
                          { key:'severity', label:'Severity' },
                          { key:'resolutionAt', label:'Done At' },
                          { key:'timeSpentHours', label:'Hours' },
                          { key:'score', label:'Skor' },
                        ]}
                        rows={scorecardData?.scorecard?.breakdown?.cm?.components?.resolution?.items || []}
                      />
                      <Inp label="Catatan" value={notes?.cm ?? ''} onChange={(e)=>setNotes((prev)=>({ ...prev, cm: e.target.value }))} placeholder="Opsional" />
                    </div>

                    <div style={{ background:T.surfaceHi,border:`1px solid ${T.border}`,borderRadius:10,padding:'13px 14px' }}>
                      <div style={{ marginBottom:10 }}>
                        <div style={{ fontSize:13,fontWeight:700,color:T.textPri }}>KPI Enhancement</div>
                        <div style={{ fontSize:11,color:T.textMute,marginTop:3 }}>Response Time dengan SLA 1 hari</div>
                      </div>
                      <HybridMetric
                        label="Response Time"
                        score={scorecardData?.scorecard?.breakdown?.enh?.components?.response?.score ?? null}
                        detail={`${scorecardData?.scorecard?.breakdown?.enh?.components?.response?.itemCount || 0} issue enhancement tervalidasi`}
                      />
                      <HybridDetailsTable
                        title="Detail response enhancement"
                        columns={[
                          { key:'issueKey', label:'Issue' },
                          { key:'createdAt', label:'Created' },
                          { key:'firstCommentAt', label:'First Response' },
                          { key:'actualHours', label:'Hours' },
                          { key:'score', label:'Skor' },
                        ]}
                        rows={scorecardData?.scorecard?.breakdown?.enh?.components?.response?.items || []}
                      />
                      <div style={{ marginTop:10 }}>
                        <Inp label="Catatan" value={notes?.enh ?? ''} onChange={(e)=>setNotes((prev)=>({ ...prev, enh: e.target.value }))} placeholder="Opsional" />
                      </div>
                    </div>

                    <div style={{ background:T.surfaceHi,border:`1px solid ${T.border}`,borderRadius:10,padding:'13px 14px' }}>
                      <div style={{ display:'flex',justifyContent:'space-between',gap:12,alignItems:'start',marginBottom:10 }}>
                        <div>
                          <div style={{ fontSize:13,fontWeight:700,color:T.textPri }}>KPI Operational Service / MSS</div>
                          <div style={{ fontSize:11,color:T.textMute,marginTop:3 }}>Untuk sementara diinput manual penuh.</div>
                        </div>
                        <div style={{ width:120 }}>
                          <Inp label="Nilai" type="number" min="-1" max="4" step="0.01" value={manualInputs.opsScore ?? ''} onChange={(e)=>setManualInputs((prev)=>({ ...prev, opsScore: e.target.value }))} placeholder="Kosong = N/A" mono />
                        </div>
                      </div>
                      <Inp label="Catatan" value={notes?.ops ?? ''} onChange={(e)=>setNotes((prev)=>({ ...prev, ops: e.target.value }))} placeholder="Opsional" />
                    </div>
                  </>
                ) : (
                  (profile?.domains || []).map((domain) => (
                    <div key={domain.key} style={{ background:T.surfaceHi,border:`1px solid ${T.border}`,borderRadius:10,padding:'13px 14px' }}>
                      <div style={{ display:'flex',justifyContent:'space-between',gap:12,alignItems:'start',marginBottom:10 }}>
                        <div>
                          <div style={{ fontSize:13,fontWeight:700,color:T.textPri }}>{domain.label}</div>
                          <div style={{ fontSize:11,color:T.textMute,marginTop:3 }}>{domain.formula}</div>
                        </div>
                        <div style={{ width:120 }}>
                          <Inp
                            label="Nilai"
                            type="number"
                            min="-1"
                            max="4"
                            step="0.01"
                            value={scores?.[domain.key] ?? ''}
                            onChange={(e)=>setScores((prev)=>({ ...prev, [domain.key]: e.target.value }))}
                            placeholder="Kosong = N/A"
                            mono
                          />
                        </div>
                      </div>
                      <Inp
                        label="Catatan"
                        value={notes?.[domain.key] ?? ''}
                        onChange={(e)=>setNotes((prev)=>({ ...prev, [domain.key]: e.target.value }))}
                        placeholder="Opsional"
                      />
                    </div>
                  ))
                )}
                <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,paddingTop:10,borderTop:`1px solid ${T.border}` }}>
                  <div style={{ fontSize:11,color:T.textMute }}>
                    {isEngineerDelivery
                      ? <>Input manual aktif: <strong style={{ color:T.textPri }}>Implementation NPS</strong>, <strong style={{ color:T.textPri }}>PM NPS</strong>, dan <strong style={{ color:T.textPri }}>Operational</strong>.</>
                      : <>Rentang nilai: <strong style={{ color:T.textPri }}>-1</strong> sampai <strong style={{ color:T.textPri }}>4</strong>. Kosong berarti tidak dihitung.</>}
                  </div>
                  <Btn v="primary" onClick={()=>saveMutation.mutate()} disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? 'Menyimpan...' : 'Simpan KPI'}
                  </Btn>
                </div>
              </div>
            )}
          </Card>

          <Card p={18} glow={KPI.color(preview.finalScore)}>
            <div style={{ display:'flex',alignItems:'center',gap:14,marginBottom:14 }}>
              <ScoreRing score={preview.finalScore} size={64} />
              <div>
                <div style={{ fontSize:10,color:T.textMute,marginBottom:4,textTransform:'uppercase',letterSpacing:'.07em' }}>
                  Preview {buildQuarterLabel(year, quarter)}
                </div>
                <div style={{ fontSize:16,fontWeight:800,color:KPI.color(preview.finalScore),fontFamily:DISPLAY }}>
                  {KPI.label(preview.finalScore)}
                </div>
                <div style={{ fontSize:11,color:T.textMute,marginTop:4 }}>
                  {profile?.label || 'Template belum tersedia'}
                </div>
              </div>
            </div>

            <div style={{ display:'flex',gap:6,flexWrap:'wrap',marginBottom:14 }}>
              <Tag color={preview.eligibleBonus ? T.green : T.red} lo={preview.eligibleBonus ? T.greenLo : T.redLo}>
                {preview.eligibleBonus ? 'Eligible QB' : 'Tidak Eligible QB'}
              </Tag>
              <Tag color={preview.qbMultiplier > 0 ? T.teal : T.textMute} lo={preview.qbMultiplier > 0 ? T.tealLo : T.border}>
                QB x{preview.qbMultiplier.toFixed(1)}
              </Tag>
              <Tag color={T.indigoHi} lo={T.indigoLo}>
                {preview.completedJiraTaskCount} task Jira done
              </Tag>
              {preview.hasViolation && <Tag color={T.red} lo={T.redLo}>Pelanggaran</Tag>}
              <Tag color={T.textMute} lo={T.border}>{preview.activeDomainCount} domain aktif</Tag>
            </div>

            <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
              {(profile?.domains || []).map((domain) => {
                const score = preview.scores?.[domain.key] ?? null;
                return (
                  <div key={domain.key} style={{ display:'flex',alignItems:'center',gap:10 }}>
                    <div style={{ width:118,fontSize:11,color:T.textSec,flexShrink:0 }}>{domain.label}</div>
                    <div style={{ flex:1 }}>
                      {score !== null ? <ScoreBar score={score} /> : <span style={{ fontSize:11,color:T.textMute,fontStyle:'italic' }}>N/A</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {scorecardData?.scorecard?.updatedAt && (
              <div style={{ marginTop:16,paddingTop:12,borderTop:`1px solid ${T.border}`,fontSize:10,color:T.textMute }}>
                Scorecard tersimpan terakhir: {new Date(scorecardData.scorecard.updatedAt).toLocaleString('id-ID')}
                {scorecardData?.scorecard?.qbLastCalculatedAt && (
                  <span> · QB terakhir dihitung: {new Date(scorecardData.scorecard.qbLastCalculatedAt).toLocaleString('id-ID')}</span>
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
