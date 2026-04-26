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

export function KpiManagementView({ currentUser }) {
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [quarter, setQuarter] = useState(currentQuarter());
  const [selectedUserId, setSelectedUserId] = useState('');
  const [scores, setScores] = useState({});
  const [notes, setNotes] = useState({});

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
  }, [scorecardData]);

  const preview = useMemo(
    () => computeManualSummary(scorecardData?.profile, scores, scorecardData?.scorecard?.completedJiraTaskCount || 0),
    [scorecardData, scores]
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payloadScores = Object.fromEntries(
        Object.entries(scores).map(([key, value]) => [key, value === '' ? null : Number(value)])
      );
      const res = await api.put(`/kpi/scorecards/${selectedUserId}`, {
        year,
        quarter,
        scores: payloadScores,
        notes,
      });
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
              Admin / Head Scoring
            </div>
            <div style={{ fontSize:12,color:T.textMute,maxWidth:640 }}>
              Nilai per domain diinput manual. Sistem hanya menghitung rata-rata domain aktif, pelanggaran, dan status bonus.
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
                {(profile?.domains || []).map((domain) => (
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
                ))}
                <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,paddingTop:10,borderTop:`1px solid ${T.border}` }}>
                  <div style={{ fontSize:11,color:T.textMute }}>
                    Rentang nilai: <strong style={{ color:T.textPri }}>-1</strong> sampai <strong style={{ color:T.textPri }}>4</strong>. Kosong berarti tidak dihitung.
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
