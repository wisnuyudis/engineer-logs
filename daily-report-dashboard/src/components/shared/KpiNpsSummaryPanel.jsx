import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { T, FONT, MONO, DISPLAY } from '../../theme/tokens';
import { buildQuarterLabel, currentQuarter } from '../../utils/kpiManual';
import { exportNpsCSV, exportNpsPDF } from '../../utils/exports';
import { countNpsFlags, npsFlag } from '../../utils/nps';
import { Btn, Card, Lbl, Tag } from '../ui/Primitives';
import api from '../../lib/api';

const scopeMeta = {
  impl_project: { label: 'Implementation Epic', short: '[IMP]', color: T.indigoHi, lo: T.indigoLo },
  op_task: { label: 'Operational Task', short: '[OP]', color: T.teal, lo: T.tealLo },
  pm_record: { label: 'Preventive Maintenance', short: '[MA]', color: T.amber, lo: T.amberLo, recordOnly: true },
};

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID');
};

const avg = (items) => {
  const scores = items.map((item) => Number(item.score)).filter((score) => Number.isFinite(score));
  if (!scores.length) return null;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
};

const formatAvg = (value) => (value === null || value === undefined ? null : Number(value.toFixed(2)));

export function KpiNpsSummaryPanel({ currentUser, reportMode = false }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState(currentQuarter());
  const [scopeFilter, setScopeFilter] = useState('all');

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['kpi-nps-summary', year, quarter],
    queryFn: async () => {
      const res = await api.get('/kpi/nps', { params: { year, quarter, perspective: 'related' } });
      return res.data;
    },
  });

  const { data: trendData } = useQuery({
    queryKey: ['kpi-nps-trend', year],
    queryFn: async () => {
      const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
      const responses = await Promise.all(
        quarters.map((q) => api.get('/kpi/nps', { params: { year, quarter: q, perspective: 'related' } }))
      );
      return responses.map((res, idx) => {
        const saved = (res.data?.items || []).filter((item) => item.hasScore);
        const average = avg(saved);
        const flags = countNpsFlags(saved);
        return {
          quarter: quarters[idx],
          avgNps: formatAvg(average),
          total: saved.length,
          promotor: flags.find((item) => item.key === 'promotor')?.count || 0,
          passive: flags.find((item) => item.key === 'passive')?.count || 0,
          detractors: flags.find((item) => item.key === 'detractors')?.count || 0,
        };
      });
    },
  });

  const savedItems = useMemo(() => (data?.items || []).filter((item) => item.hasScore), [data]);
  const items = useMemo(() => (
    scopeFilter === 'all' ? savedItems : savedItems.filter((item) => item.scope === scopeFilter)
  ), [savedItems, scopeFilter]);

  const counts = useMemo(() => ({
    all: savedItems.length,
    impl_project: savedItems.filter((item) => item.scope === 'impl_project').length,
    op_task: savedItems.filter((item) => item.scope === 'op_task').length,
    pm_record: savedItems.filter((item) => item.scope === 'pm_record').length,
    average: avg(savedItems),
  }), [savedItems]);

  const selectedFlagCounts = useMemo(() => countNpsFlags(savedItems), [savedItems]);
  const flagTotal = selectedFlagCounts.reduce((sum, item) => sum + item.count, 0);
  const pieData = selectedFlagCounts
    .filter((item) => item.count > 0)
    .map((item) => ({
      ...item,
      percentage: flagTotal ? Number(((item.count / flagTotal) * 100).toFixed(2)) : 0,
    }));

  const handleExport = (format) => {
    const payload = { items, year, quarter, actor: currentUser, canSeeAll: data?.canSeeAll };
    if (format === 'csv') exportNpsCSV(payload);
    else exportNpsPDF(payload);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{`
        .nps-summary-toolbar {
          display:grid;
          grid-template-columns:minmax(220px,1fr) minmax(280px,auto);
          gap:14px;
          align-items:end;
        }
        .nps-summary-grid {
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(170px,1fr));
          gap:12px;
        }
        .nps-summary-table-wrap {
          overflow-x:auto;
          border:1px solid ${T.border};
          border-radius:12px;
        }
        .nps-summary-table {
          width:100%;
          min-width:980px;
          border-collapse:collapse;
          font-size:11px;
          color:${T.textPri};
        }
        .nps-summary-table th {
          text-align:left;
          padding:10px 12px;
          border-bottom:1px solid ${T.border};
          background:${T.surfaceHi};
          white-space:nowrap;
        }
        .nps-summary-table td {
          padding:10px 12px;
          border-bottom:1px solid ${T.border};
          vertical-align:top;
        }
        .nps-summary-chart-grid {
          display:grid;
          grid-template-columns:minmax(0,1.2fr) minmax(260px,.8fr);
          gap:14px;
          align-items:stretch;
        }
        .nps-summary-chart {
          height:260px;
        }
        .nps-summary-flag-list {
          display:flex;
          flex-direction:column;
          gap:8px;
          margin-top:8px;
        }
        @media (max-width: 780px) {
          .nps-summary-toolbar {
            grid-template-columns:1fr;
          }
          .nps-summary-chart-grid {
            grid-template-columns:1fr;
          }
        }
      `}</style>

      <Card p={18}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 10, color: T.textMute, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.07em' }}>
              {reportMode ? 'NPS Report' : 'Dashboard NPS'}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.textPri, fontFamily: DISPLAY, marginBottom: 6 }}>
              NPS yang Sudah Diinput
            </div>
            <div style={{ fontSize: 12, color: T.textMute, maxWidth: 760, lineHeight: 1.5 }}>
              Menampilkan detail NPS, engineer terkait, PM penginput, dan komentar. Admin/Head melihat semua data; user lain melihat NPS yang berkaitan dengan akun Jira miliknya.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Tag color={T.indigoHi} lo={T.indigoLo}>{currentUser?.role}</Tag>
            <Tag color={T.textMute} lo={T.border}>{data?.canSeeAll ? 'All NPS' : 'Assigned only'}</Tag>
          </div>
        </div>
      </Card>

      <Card p={18}>
        <div className="nps-summary-toolbar">
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
            {reportMode && (
              <>
                <Btn v="teal" sz="sm" onClick={() => handleExport('csv')} disabled={!items.length}>CSV</Btn>
                <Btn v="ghost" sz="sm" onClick={() => handleExport('pdf')} disabled={!items.length}>PDF</Btn>
              </>
            )}
          </div>
        </div>
      </Card>

      <div className="nps-summary-grid">
        {[
          { label: 'Total Input', value: counts.all, color: T.indigoHi },
          { label: 'Implementation', value: counts.impl_project, color: T.indigoHi },
          { label: 'Operational', value: counts.op_task, color: T.teal },
          { label: 'Preventive Maint.', value: counts.pm_record, color: T.amber },
          { label: 'Avg NPS', value: counts.average === null ? '-' : counts.average.toFixed(2), color: T.green },
        ].map((item) => (
          <Card key={item.label} p={0} glow={item.color} style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: T.textMute, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: item.color, fontFamily: MONO }}>{item.value}</div>
            </div>
            <div style={{ height: 2, background: item.color, opacity: .5 }} />
          </Card>
        ))}
      </div>

      <div className="nps-summary-chart-grid">
        <Card p={18}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.textPri }}>Trend NPS Score</div>
              <div style={{ fontSize: 11, color: T.textMute, marginTop: 4 }}>Avg nilai NPS per quarter, 2 digit desimal.</div>
            </div>
            <Tag color={T.green} lo={T.greenLo}>{year}</Tag>
          </div>
          <div className="nps-summary-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData || []} margin={{ top: 8, right: 12, left: -20, bottom: 2 }}>
                <CartesianGrid stroke={T.border} strokeDasharray="3 3" />
                <XAxis dataKey="quarter" stroke={T.textMute} tick={{ fill: T.textMute, fontSize: 11 }} />
                <YAxis domain={[1, 4]} stroke={T.textMute} tick={{ fill: T.textMute, fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.textPri }}
                  formatter={(value, name, props) => [
                    value === null ? '-' : Number(value).toFixed(2),
                    `${name === 'avgNps' ? 'Avg NPS' : name} (${props?.payload?.total || 0} input)`,
                  ]}
                />
                <Line type="monotone" dataKey="avgNps" name="Avg NPS" stroke={T.green} strokeWidth={3} dot={{ r: 4, fill: T.green }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card p={18}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.textPri, marginBottom: 4 }}>Trend Count by Flag</div>
          <div style={{ fontSize: 11, color: T.textMute, marginBottom: 12 }}>Jumlah Promotor, Passive, dan Detractors per quarter.</div>
          <div className="nps-summary-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData || []} margin={{ top: 8, right: 8, left: -20, bottom: 2 }}>
                <CartesianGrid stroke={T.border} strokeDasharray="3 3" />
                <XAxis dataKey="quarter" stroke={T.textMute} tick={{ fill: T.textMute, fontSize: 11 }} />
                <YAxis allowDecimals={false} stroke={T.textMute} tick={{ fill: T.textMute, fontSize: 11 }} />
                <Tooltip contentStyle={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.textPri }} />
                <Legend wrapperStyle={{ color: T.textMute, fontSize: 11 }} />
                <Bar dataKey="promotor" name="Promotor" fill={T.green} radius={[5, 5, 0, 0]} />
                <Bar dataKey="passive" name="Passive" fill={T.amber} radius={[5, 5, 0, 0]} />
                <Bar dataKey="detractors" name="Detractors" fill={T.red} radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card p={18}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 18, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.textPri }}>Persentase Flag {buildQuarterLabel(year, quarter)}</div>
            <div style={{ fontSize: 11, color: T.textMute, marginTop: 4 }}>
              Berdasarkan seluruh data tersimpan pada quarter terpilih.
            </div>
            <div className="nps-summary-flag-list">
              {selectedFlagCounts.map((item) => (
                <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', fontSize: 12 }}>
                  <Tag color={item.color} lo={item.lo}>{item.label}</Tag>
                  <span style={{ color: T.textPri, fontFamily: MONO, fontWeight: 800 }}>
                    {item.count} · {flagTotal ? ((item.count / flagTotal) * 100).toFixed(2) : '0.00'}%
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="nps-summary-chart">
            {pieData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="count" nameKey="label" innerRadius={54} outerRadius={92} paddingAngle={2}>
                    {pieData.map((entry) => <Cell key={entry.key} fill={entry.color} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.textPri }}
                    formatter={(value, name, props) => [`${value} (${props?.payload?.percentage?.toFixed(2)}%)`, name]}
                  />
                  <Legend wrapperStyle={{ color: T.textMute, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: T.textMute, fontSize: 12 }}>
                Belum ada data flag untuk filter ini.
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card p={18}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.textPri }}>Detail NPS {buildQuarterLabel(year, quarter)}</div>
            <div style={{ fontSize: 11, color: T.textMute, marginTop: 4 }}>
              {items.length} data tersimpan{isFetching ? ' · sync Jira...' : ''}
            </div>
          </div>
          <Tag color={T.green} lo={T.greenLo}>Sudah input</Tag>
        </div>

        {isLoading ? (
          <div style={{ fontSize: 12, color: T.textMute }}>Memuat data NPS...</div>
        ) : error ? (
          <div style={{ padding: '11px 12px', borderRadius: 10, background: T.redLo, border: `1px solid ${T.red}35`, color: T.textPri, fontSize: 12 }}>
            {error?.response?.data?.error || 'Gagal memuat data NPS.'}
          </div>
        ) : !items.length ? (
          <div style={{ fontSize: 12, color: T.textMute }}>Belum ada NPS yang diinput untuk filter ini.</div>
        ) : (
          <div className="nps-summary-table-wrap">
            <table className="nps-summary-table">
              <thead>
                <tr>
                  <th>Scope</th>
                  <th>Issue</th>
                  <th>Project</th>
                  <th>Summary</th>
                  <th>Related Engineer</th>
                  <th>PM Input</th>
                  <th>Done At</th>
                  <th>NPS</th>
                  <th>Flag</th>
                  <th>Komentar</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const meta = scopeMeta[item.scope] || scopeMeta.impl_project;
                  const flag = npsFlag(item.score);
                  return (
                    <tr key={`${item.scope}:${item.jiraIssueKey}`}>
                      <td>
                        <Tag color={meta.color} lo={meta.lo}>{meta.short}</Tag>
                        <div style={{ fontSize: 10, color: T.textMute, marginTop: 6 }}>{meta.label}</div>
                        {meta.recordOnly && <div style={{ fontSize: 10, color: T.amber, marginTop: 4 }}>Pencatatan saja</div>}
                      </td>
                      <td>
                        <a href={item.issueUrl} target="_blank" rel="noreferrer" style={{ color: T.indigoHi, fontWeight: 800, fontFamily: MONO, textDecoration: 'none' }}>
                          {item.jiraIssueKey}
                        </a>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{item.projectKey || '-'}</div>
                        <div style={{ color: T.textMute, marginTop: 4, maxWidth: 180 }}>{item.projectName || '-'}</div>
                      </td>
                      <td style={{ minWidth: 220 }}>
                        <div style={{ fontWeight: 700 }}>{item.summary || '-'}</div>
                        <div style={{ color: T.textMute, marginTop: 4 }}>{item.issueTypeName || '-'} · {item.statusName || '-'}</div>
                      </td>
                      <td>{(item.relatedEngineerDisplayNames || []).join(', ') || '-'}</td>
                      <td>{item.assignedPmDisplayName || '-'}</td>
                      <td>{formatDateTime(item.resolutionDate)}</td>
                      <td><Tag color={T.green} lo={T.greenLo}>NPS {item.score}</Tag></td>
                      <td><Tag color={flag.color} lo={flag.lo}>{flag.label}</Tag></td>
                      <td style={{ minWidth: 220, color: item.comment ? T.textPri : T.textMute }}>{item.comment || '-'}</td>
                      <td>{formatDateTime(item.updatedAt)}</td>
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
