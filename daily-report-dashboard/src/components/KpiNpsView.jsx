import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { T, FONT, MONO, DISPLAY } from '../theme/tokens';
import { buildQuarterLabel, currentQuarter } from '../utils/kpiManual';
import { npsFlag } from '../utils/nps';
import { Btn, Card, Lbl, Tag } from './ui/Primitives';
import api from '../lib/api';

const scopeMeta = {
  impl_project: { label: 'Implementation Epic', short: '[IMP]', color: T.indigoHi, lo: T.indigoLo },
  op_task: { label: 'Operational Task', short: '[OP]', color: T.teal, lo: T.tealLo },
  pm_record: { label: 'Preventive Maintenance', short: '[MA]', color: T.amber, lo: T.amberLo, recordOnly: true },
};

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID');
}

function ScoreSelect({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      style={{
        width: 82,
        background: T.surface,
        border: `1.5px solid ${T.border}`,
        borderRadius: 8,
        padding: '8px 10px',
        color: T.textPri,
        fontSize: 12,
        fontFamily: MONO,
        outline: 'none',
      }}
    >
      {[1, 2, 3, 4].map((score) => (
        <option key={score} value={score}>{score}</option>
      ))}
    </select>
  );
}

function InputStatusBadge({ done }) {
  return (
    <Tag color={done ? T.green : T.amber} lo={done ? T.greenLo : T.amberLo}>
      {done ? 'Sudah input' : 'Belum input'}
    </Tag>
  );
}

export function KpiNpsView({ currentUser }) {
  const queryClient = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState(currentQuarter());
  const [scopeFilter, setScopeFilter] = useState('all');
  const [drafts, setDrafts] = useState({});

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['kpi-nps', year, quarter],
    queryFn: async () => {
      const res = await api.get('/kpi/nps', { params: { year, quarter } });
      return res.data;
    },
  });

  useEffect(() => {
    const next = {};
    for (const item of data?.items || []) {
      const key = `${item.scope}:${item.jiraIssueKey}`;
      next[key] = {
        score: String(item.score ?? 3),
        comment: item.comment || '',
      };
    }
    setDrafts(next);
  }, [data]);

  const items = useMemo(() => {
    const raw = data?.items || [];
    return scopeFilter === 'all' ? raw : raw.filter((item) => item.scope === scopeFilter);
  }, [data, scopeFilter]);

  const counts = useMemo(() => {
    const raw = data?.items || [];
    return {
      all: raw.length,
      impl_project: raw.filter((item) => item.scope === 'impl_project').length,
      op_task: raw.filter((item) => item.scope === 'op_task').length,
      pm_record: raw.filter((item) => item.scope === 'pm_record').length,
      filled: raw.filter((item) => item.hasScore).length,
      missing: raw.filter((item) => !item.hasScore).length,
    };
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (item) => {
      const key = `${item.scope}:${item.jiraIssueKey}`;
      const draft = drafts[key] || { score: 3, comment: '' };
      const res = await api.put('/kpi/nps', {
        year,
        quarter,
        scope: item.scope,
        jiraIssueKey: item.jiraIssueKey,
        score: Number(draft.score),
        comment: draft.comment || '',
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('NPS berhasil disimpan.');
      queryClient.invalidateQueries({ queryKey: ['kpi-nps', year, quarter] });
      queryClient.invalidateQueries({ queryKey: ['kpi-nps-summary'] });
      queryClient.invalidateQueries({ queryKey: ['kpi-nps-trend'] });
      queryClient.invalidateQueries({ queryKey: ['kpi-scorecard'] });
    },
    onError: (mutationError) => {
      toast.error(mutationError?.response?.data?.error || 'Gagal menyimpan KPI NPS.');
    },
  });

  const updateDraft = (item, patch) => {
    const key = `${item.scope}:${item.jiraIssueKey}`;
    setDrafts((prev) => ({
      ...prev,
      [key]: {
        score: String(item.score ?? 3),
        comment: item.comment || '',
        ...(prev[key] || {}),
        ...patch,
      },
    }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        .kpi-nps-toolbar {
          display:grid;
          grid-template-columns:minmax(220px,1fr) minmax(260px,auto);
          gap:14px;
          align-items:end;
        }
        .kpi-nps-table-wrap {
          overflow-x:auto;
          border:1px solid ${T.border};
          border-radius:12px;
        }
        .kpi-nps-table {
          width:100%;
          min-width:980px;
          border-collapse:collapse;
          font-size:11px;
          color:${T.textPri};
        }
        .kpi-nps-table th {
          text-align:left;
          padding:10px 12px;
          border-bottom:1px solid ${T.border};
          background:${T.surfaceHi};
          white-space:nowrap;
        }
        .kpi-nps-table td {
          padding:10px 12px;
          border-bottom:1px solid ${T.border};
          vertical-align:top;
        }
        .kpi-nps-row-missing {
          background:linear-gradient(90deg, ${T.amberLo} 0%, transparent 42%);
        }
        .kpi-nps-row-filled {
          background:linear-gradient(90deg, ${T.greenLo} 0%, transparent 34%);
        }
        .kpi-nps-comment {
          width:100%;
          min-width:180px;
          min-height:38px;
          background:${T.surface};
          color:${T.textPri};
          border:1.5px solid ${T.border};
          border-radius:8px;
          padding:8px 10px;
          font-family:${FONT};
          font-size:12px;
          resize:vertical;
          box-sizing:border-box;
          outline:none;
        }
        @media (max-width: 780px) {
          .kpi-nps-toolbar {
            grid-template-columns:1fr;
          }
        }
      `}</style>

      <Card p={18}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 10, color: T.textMute, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.07em' }}>
              KPI NPS
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.textPri, fontFamily: DISPLAY, marginBottom: 6 }}>
              Input NPS per Project / Task
            </div>
            <div style={{ fontSize: 12, color: T.textMute, maxWidth: 760, lineHeight: 1.5 }}>
              NPS `[IMP]` muncul dari Epic yang selesai pada periode. NPS `[OP]` muncul dari task `[OP]` yang selesai pada periode. `[MA]` Preventive Maintenance hanya untuk pencatatan, tidak masuk perhitungan poin KPI.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Tag color={T.indigoHi} lo={T.indigoLo}>{currentUser?.role}</Tag>
            <Tag color={T.textMute} lo={T.border}>{data?.canSeeAll ? 'All projects' : 'Assigned only'}</Tag>
          </div>
        </div>
      </Card>

      <Card p={18}>
        <div className="kpi-nps-toolbar">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: 10 }}>
            <div>
              <Lbl>Quarter</Lbl>
              <div style={{ display: 'flex', gap: 3, background: T.surfaceHi, padding: 3, borderRadius: 8, border: `1px solid ${T.border}` }}>
                {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
                  <button key={q} onClick={() => setQuarter(q)} style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: FONT, fontSize: 11, fontWeight: q === quarter ? 700 : 400, background: q === quarter ? T.indigo : 'transparent', color: q === quarter ? '#fff' : T.textMute }}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Lbl>Year</Lbl>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, background: T.surfaceHi, padding: '5px 6px', borderRadius: 8, border: `1px solid ${T.border}` }}>
                <button onClick={() => setYear((v) => v - 1)} style={{ background: 'none', border: 'none', color: T.textMute, cursor: 'pointer', fontSize: 13 }}>‹</button>
                <span style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, color: T.textPri, fontFamily: MONO }}>{year}</span>
                <button onClick={() => setYear((v) => v + 1)} style={{ background: 'none', border: 'none', color: T.textMute, cursor: 'pointer', fontSize: 13 }}>›</button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {[
              ['all', `Semua (${counts.all})`],
              ['impl_project', `[IMP] (${counts.impl_project})`],
              ['op_task', `[OP] (${counts.op_task})`],
              ['pm_record', `[MA] (${counts.pm_record})`],
            ].map(([key, label]) => (
              <button key={key} onClick={() => setScopeFilter(key)} style={{ padding: '8px 12px', borderRadius: 999, border: `1.5px solid ${scopeFilter === key ? T.indigo : T.border}`, background: scopeFilter === key ? T.indigoLo : T.surfaceHi, color: scopeFilter === key ? T.indigoHi : T.textSec, cursor: 'pointer', fontFamily: FONT, fontSize: 11, fontWeight: scopeFilter === key ? 800 : 600 }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card p={18}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.textPri }}>Daftar NPS {buildQuarterLabel(year, quarter)}</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop: 8 }}>
              <Tag color={T.green} lo={T.greenLo}>{counts.filled} sudah input</Tag>
              <Tag color={T.amber} lo={T.amberLo}>{counts.missing} belum input</Tag>
              {isFetching && <Tag color={T.textMute} lo={T.border}>Sync Jira...</Tag>}
            </div>
          </div>
          <Tag color={counts.missing ? T.amber : T.green} lo={counts.missing ? T.amberLo : T.greenLo}>
            {counts.missing ? `${counts.missing} belum input` : 'Lengkap'}
          </Tag>
        </div>

        {isLoading ? (
          <div style={{ fontSize: 12, color: T.textMute }}>Memuat KPI NPS...</div>
        ) : error ? (
          <div style={{ padding: '11px 12px', borderRadius: 10, background: T.redLo, border: `1px solid ${T.red}35`, color: T.textPri, fontSize: 12 }}>
            {error?.response?.data?.error || 'Gagal memuat KPI NPS.'}
          </div>
        ) : !items.length ? (
          <div style={{ fontSize: 12, color: T.textMute }}>Tidak ada item NPS yang selesai pada periode ini.</div>
        ) : (
          <div className="kpi-nps-table-wrap">
            <table className="kpi-nps-table">
              <thead>
                <tr>
                  <th>Scope</th>
                  <th>Issue</th>
                  <th>Project</th>
                  <th>Summary</th>
                  <th>PM Assigned</th>
                  <th>Done At</th>
                  <th>Status Input</th>
                  <th>NPS</th>
                  <th>Komentar</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const meta = scopeMeta[item.scope] || scopeMeta.impl_project;
                  const key = `${item.scope}:${item.jiraIssueKey}`;
                  const draft = drafts[key] || { score: String(item.score ?? 3), comment: item.comment || '' };
                  const draftFlag = npsFlag(draft.score);
                  return (
                    <tr key={key} className={item.hasScore ? 'kpi-nps-row-filled' : 'kpi-nps-row-missing'}>
                      <td>
                        <Tag color={meta.color} lo={meta.lo}>{meta.short}</Tag>
                        <div style={{ fontSize: 10, color: T.textMute, marginTop: 6 }}>{meta.label}</div>
                        {meta.recordOnly && <div style={{ fontSize: 10, color: T.amber, marginTop: 4 }}>Pencatatan saja</div>}
                      </td>
                      <td>
                        <a href={item.issueUrl} target="_blank" rel="noreferrer" style={{ color: T.indigoHi, fontWeight: 800, fontFamily: MONO, textDecoration: 'none' }}>
                          {item.jiraIssueKey}
                        </a>
                        <div style={{ marginTop: 6 }}>
                          <Tag color={item.hasScore ? T.green : T.textMute} lo={item.hasScore ? T.greenLo : T.border}>
                            NPS {item.hasScore ? item.score : 'N/A'}
                          </Tag>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{item.projectKey || '-'}</div>
                        <div style={{ color: T.textMute, marginTop: 4, maxWidth: 180 }}>{item.projectName || '-'}</div>
                      </td>
                      <td style={{ minWidth: 220 }}>
                        <div style={{ fontWeight: 700 }}>{item.summary || '-'}</div>
                        <div style={{ color: T.textMute, marginTop: 4 }}>{item.issueTypeName || '-'} · {item.statusName || '-'}</div>
                      </td>
                      <td>{item.assignedPmDisplayName || '-'}</td>
                      <td>{formatDateTime(item.resolutionDate)}</td>
                      <td>
                        <InputStatusBadge done={item.hasScore} />
                        <div style={{ fontSize:10,color:T.textMute,marginTop:6 }}>
                          {item.hasScore ? `Tersimpan ${formatDateTime(item.updatedAt)}` : 'Nilai belum tersimpan'}
                        </div>
                      </td>
                      <td>
                        <ScoreSelect value={draft.score} onChange={(score) => updateDraft(item, { score })} />
                        <div style={{ marginTop: 8 }}>
                          <Tag color={draftFlag.color} lo={draftFlag.lo}>{draftFlag.label}</Tag>
                        </div>
                      </td>
                      <td>
                        <textarea
                          className="kpi-nps-comment"
                          value={draft.comment}
                          onChange={(event) => updateDraft(item, { comment: event.target.value })}
                          placeholder="Opsional"
                        />
                      </td>
                      <td>
                        <Btn v="primary" sz="sm" onClick={() => saveMutation.mutate(item)} disabled={saveMutation.isPending}>
                          Simpan
                        </Btn>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
