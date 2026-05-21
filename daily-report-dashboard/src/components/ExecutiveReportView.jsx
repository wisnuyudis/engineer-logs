import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { T, MONO, DISPLAY } from '../theme/tokens';
import { Card, Btn, Inp, Lbl, Tag } from './ui/Primitives';
import api from '../lib/api';

const currentQuarter = () => `Q${Math.floor(new Date().getMonth() / 3) + 1}`;
const quarterRange = (year, quarter) => {
  const ranges = {
    Q1: [`${year}-01-01`, `${year}-03-31`],
    Q2: [`${year}-04-01`, `${year}-06-30`],
    Q3: [`${year}-07-01`, `${year}-09-30`],
    Q4: [`${year}-10-01`, `${year}-12-31`],
  };
  return ranges[quarter] || ranges.Q1;
};

const fmtHour = (value) => value === null || value === undefined ? 'N/A' : `${Number(value).toFixed(1)}h`;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const fmtPeriod = (period) => `${period?.startDate || '-'} s/d ${period?.endDate || '-'}`;

const buildInlineBars = (rows, keys) => {
  const max = Math.max(1, ...rows.flatMap((row) => keys.map((key) => Number(row[key] || 0))));
  return rows.map((row) => `
    <div class="bar-row">
      <div class="bar-label">${esc(row.customer || row.month)}</div>
      <div class="bar-stack">
        ${keys.map((key) => {
          const value = Number(row[key] || 0);
          return `<div class="bar ${key}" style="width:${Math.max(3, (value / max) * 100)}%"><span>${value}</span></div>`;
        }).join('')}
      </div>
    </div>
  `).join('');
};

export function ExecutiveReportView() {
  const [mode, setMode] = useState('quarter');
  const [year, setYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState(currentQuarter());
  const [dateFrom, setDateFrom] = useState(quarterRange(year, quarter)[0]);
  const [dateTo, setDateTo] = useState(quarterRange(year, quarter)[1]);
  const [reportCustomer, setReportCustomer] = useState('');

  const effectiveRange = useMemo(() => {
    if (mode === 'quarter') return quarterRange(year, quarter);
    return [dateFrom, dateTo];
  }, [dateFrom, dateTo, mode, quarter, year]);

  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ['executive-report', effectiveRange[0], effectiveRange[1]],
    queryFn: async () => {
      const res = await api.get('/reports/executive', {
        params: { startDate: effectiveRange[0], endDate: effectiveRange[1] },
      });
      return res.data;
    },
    enabled: Boolean(effectiveRange[0] && effectiveRange[1]),
  });

  const trendChart = useMemo(() => {
    const byMonth = new Map();
    for (const row of data?.monthlyTrend || []) {
      const current = byMonth.get(row.month) || { month: row.month, problem: 0, change: 0, total: 0 };
      current.problem += row.problem || 0;
      current.change += row.change || 0;
      current.total += row.total || 0;
      byMonth.set(row.month, current);
    }
    return Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [data]);

  const customerTypeChart = useMemo(() => (
    (data?.customerRows || []).slice(0, 12).map((row) => ({
      customer: row.customer,
      problem: row.problem,
      change: row.change,
      total: row.totalTickets,
    }))
  ), [data]);

  const solutionCategoryRows = useMemo(() => (
    (data?.solutionCategories || []).map((row) => ({
      ...row,
      total: row.categories.reduce((sum, item) => sum + Number(item.count || 0), 0),
    })).sort((a, b) => b.total - a.total)
  ), [data]);

  const generateExecutivePdf = (type) => {
    if (!data) return;
    const selectedCustomer = type === 'customer' ? reportCustomer : '';
    const issues = selectedCustomer
      ? (data.issues || []).filter((issue) => issue.customer === selectedCustomer)
      : (data.issues || []);
    if (type === 'customer' && !selectedCustomer) {
      return;
    }
    const customerRows = selectedCustomer
      ? (data.customerRows || []).filter((row) => row.customer === selectedCustomer)
      : (data.customerRows || []);
    const solutionRows = selectedCustomer
      ? solutionCategoryRows.filter((row) => row.customer === selectedCustomer)
      : solutionCategoryRows;
    const trendRows = selectedCustomer
      ? (data.monthlyTrend || []).filter((row) => row.customer === selectedCustomer)
      : trendChart;
    const title = selectedCustomer ? `Executive Report - ${selectedCustomer}` : 'Executive Summary - SUP Problem & Change';
    const win = window.open('', '_blank');
    if (!win) {
      alert('Pop-up diblokir browser. Izinkan pop-up untuk generate report PDF.');
      return;
    }

    win.document.write(`<!doctype html>
      <html>
      <head>
        <title>${esc(title)}</title>
        <style>
          @page { size: A4 landscape; margin: 14mm; }
          body { font-family: Inter, Arial, sans-serif; color:#111827; margin:0; background:#fff; }
          h1 { margin:0; font-size:22px; }
          h2 { margin:24px 0 10px; font-size:14px; text-transform:uppercase; letter-spacing:.08em; color:#334155; }
          .muted { color:#64748b; font-size:11px; margin-top:4px; }
          .cards { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-top:16px; }
          .card { border:1px solid #dbe3ef; border-radius:12px; padding:12px; background:#f8fafc; }
          .label { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:#64748b; font-weight:700; }
          .value { font-size:24px; font-weight:900; margin-top:5px; }
          table { width:100%; border-collapse:collapse; font-size:10px; }
          th { text-align:left; background:#eef2f7; color:#475569; text-transform:uppercase; letter-spacing:.05em; font-size:9px; }
          th, td { padding:7px 8px; border:1px solid #dbe3ef; vertical-align:top; }
          .bar-row { display:grid; grid-template-columns:170px 1fr; gap:10px; align-items:center; margin:6px 0; font-size:10px; }
          .bar-label { font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          .bar-stack { display:flex; gap:5px; align-items:center; min-height:22px; }
          .bar { min-width:24px; height:20px; border-radius:7px; color:#fff; font-weight:800; display:flex; align-items:center; justify-content:flex-end; padding-right:6px; box-sizing:border-box; }
          .bar.problem { background:linear-gradient(90deg,#ef4444,#f97316); }
          .bar.change { background:linear-gradient(90deg,#14b8a6,#22c55e); }
          .bar.total { background:linear-gradient(90deg,#6366f1,#06b6d4); }
          .breakdown { display:flex; gap:4px; flex-wrap:wrap; }
          .pill { border:1px solid #c7d2fe; color:#3730a3; background:#eef2ff; border-radius:999px; padding:2px 7px; font-size:9px; font-weight:700; }
        </style>
      </head>
      <body>
        <h1>${esc(title)}</h1>
        <div class="muted">Periode: ${esc(fmtPeriod(data.period))} · Generated ${new Date().toLocaleString('id-ID')}</div>
        <div class="cards">
          <div class="card"><div class="label">Total Tiket</div><div class="value">${issues.length}</div></div>
          <div class="card"><div class="label">Problem</div><div class="value">${issues.filter((issue) => issue.type === 'problem').length}</div></div>
          <div class="card"><div class="label">Change</div><div class="value">${issues.filter((issue) => issue.type === 'change').length}</div></div>
          <div class="card"><div class="label">Customer</div><div class="value">${selectedCustomer ? 1 : (data.totals?.customers || 0)}</div></div>
        </div>

        <h2>Trend Tiket</h2>
        ${buildInlineBars(trendRows.map((row) => ({ month: row.month, problem: row.problem, change: row.change })), ['problem','change'])}

        <h2>Ringkasan Customer</h2>
        <table>
          <thead><tr><th>Customer</th><th>Total</th><th>Problem</th><th>Change</th><th>Avg Resolution</th><th>Tiket / Month</th><th>% Problem</th></tr></thead>
          <tbody>
            ${customerRows.map((row) => `<tr><td>${esc(row.customer)}</td><td>${row.totalTickets}</td><td>${row.problem}</td><td>${row.change}</td><td>${fmtHour(row.avgResolutionHours)}</td><td>${row.ticketsPerMonth}</td><td>${row.problemPct}%</td></tr>`).join('')}
          </tbody>
        </table>

        <h2>Kategori Solusi per Customer</h2>
        <table>
          <thead><tr><th>Customer</th><th>Pecahan Kategori</th><th>Total</th></tr></thead>
          <tbody>
            ${solutionRows.map((row) => `<tr><td>${esc(row.customer)}</td><td><div class="breakdown">${row.categories.map((item) => `<span class="pill">${esc(item.category)}: ${item.count}</span>`).join('')}</div></td><td>${row.total}</td></tr>`).join('')}
          </tbody>
        </table>

        <h2>Detail SUP</h2>
        <table>
          <thead><tr><th>Issue</th><th>Customer</th><th>Type</th><th>Topic</th><th>Status</th><th>Created</th><th>Resolution</th></tr></thead>
          <tbody>
            ${issues.map((issue) => `<tr><td>${esc(issue.key)}</td><td>${esc(issue.customer)}</td><td>${esc(issue.type)}</td><td>${esc(issue.ticketTopic)}</td><td>${esc(issue.status)}</td><td>${esc(issue.createdAt ? issue.createdAt.slice(0, 10) : '-')}</td><td>${fmtHour(issue.resolutionHours)}</td></tr>`).join('')}
          </tbody>
        </table>
        <script>window.print();</script>
      </body>
      </html>`);
    win.document.close();
  };

  return (
    <div style={{ display:'flex',flexDirection:'column',gap:14 }}>
      <Card p={18}>
        <div style={{ display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:12,flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:11,fontWeight:800,color:T.textSec,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:4 }}>Executive Report</div>
            <div style={{ fontSize:18,fontWeight:900,color:T.textPri,fontFamily:DISPLAY }}>SUP Problem & Change Usage by Customer</div>
            <div style={{ fontSize:12,color:T.textMute,marginTop:3 }}>Data ditarik langsung dari Jira ticketing `SUP-*` untuk periode terpilih.</div>
          </div>
          <div style={{ display:'flex',gap:8,alignItems:'center',flexWrap:'wrap' }}>
            <Tag color={T.jira} lo={T.jiraLo}>Jira Live</Tag>
            <Btn v="teal" onClick={() => generateExecutivePdf('screen')} disabled={!data || isFetching}>Generate Summary</Btn>
            <Btn v="sec" onClick={() => refetch()} disabled={isFetching}>{isFetching ? 'Memuat...' : 'Refresh'}</Btn>
          </div>
        </div>
      </Card>

      <Card p={16}>
        <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,alignItems:'end' }}>
          <div>
            <Lbl>Mode Periode</Lbl>
            <select value={mode} onChange={(event) => setMode(event.target.value)} style={{ width:'100%',padding:'9px 10px',borderRadius:8,border:`1.5px solid ${T.border}`,background:T.surfaceHi,color:T.textPri }}>
              <option value="quarter">Quarter</option>
              <option value="range">Range Bulan/Tanggal</option>
            </select>
          </div>
          {mode === 'quarter' ? (
            <>
              <Inp label="Tahun" type="number" value={year} onChange={(event) => setYear(Number(event.target.value) || new Date().getFullYear())} />
              <div>
                <Lbl>Quarter</Lbl>
                <select value={quarter} onChange={(event) => setQuarter(event.target.value)} style={{ width:'100%',padding:'9px 10px',borderRadius:8,border:`1.5px solid ${T.border}`,background:T.surfaceHi,color:T.textPri }}>
                  {['Q1','Q2','Q3','Q4'].map((q) => <option key={q} value={q}>{q}</option>)}
                </select>
              </div>
            </>
          ) : (
            <>
              <Inp label="Dari" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              <Inp label="Sampai" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </>
          )}
          <div>
            <Lbl>Report by Customer</Lbl>
            <select value={reportCustomer} onChange={(event) => setReportCustomer(event.target.value)} style={{ width:'100%',padding:'9px 10px',borderRadius:8,border:`1.5px solid ${T.border}`,background:T.surfaceHi,color:T.textPri }}>
              <option value="">Pilih customer...</option>
              {(data?.customerRows || []).map((row) => <option key={row.customer} value={row.customer}>{row.customer}</option>)}
            </select>
          </div>
          <Btn v="ghost" onClick={() => generateExecutivePdf('customer')} disabled={!data || isFetching || !reportCustomer}>Generate Customer SUP</Btn>
        </div>
      </Card>

      {error && <Card p={16}><div style={{ color:T.red,fontSize:13 }}>{error?.response?.data?.error || 'Gagal memuat executive report'}</div></Card>}

      <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12 }}>
        {[
          ['Total Tiket', data?.totals?.totalTickets || 0, T.indigoHi],
          ['Problem / CM', data?.totals?.problem || 0, T.red],
          ['Change / Enhancement', data?.totals?.change || 0, T.teal],
          ['Customer', data?.totals?.customers || 0, T.amber],
        ].map(([label, value, color]) => (
          <Card key={label} p={15} glow={color}>
            <div style={{ fontSize:10,color:T.textMute,textTransform:'uppercase',letterSpacing:'.07em',fontWeight:800 }}>{label}</div>
            <div style={{ fontSize:26,fontWeight:900,color,fontFamily:MONO,marginTop:6 }}>{value}</div>
          </Card>
        ))}
      </div>

      <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:14 }}>
        <Card p={18}>
          <div style={{ fontSize:12,fontWeight:800,color:T.textPri,marginBottom:12 }}>Tren Tiket per Bulan</div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={trendChart}>
              <defs>
                <linearGradient id="problemGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={T.red} stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#f97316" stopOpacity={0.75} />
                </linearGradient>
                <linearGradient id="changeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={T.teal} stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0.75} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={T.border} vertical={false} strokeDasharray="4 4" />
              <XAxis dataKey="month" tick={{ fill:T.textMute,fontSize:11 }} />
              <YAxis tick={{ fill:T.textMute,fontSize:11 }} />
              <Tooltip contentStyle={{ background:T.surfaceHi,border:`1px solid ${T.border}`,borderRadius:8,color:T.textPri }} />
              <Legend />
              <Bar dataKey="problem" name="Problem" stackId="a" fill="url(#problemGrad)" radius={[8, 8, 0, 0]}>
                <LabelList dataKey="problem" position="insideTop" fill="#fff" fontSize={10} fontWeight={800} />
              </Bar>
              <Bar dataKey="change" name="Change" stackId="a" fill="url(#changeGrad)" radius={[8, 8, 0, 0]}>
                <LabelList dataKey="change" position="top" fill={T.textPri} fontSize={10} fontWeight={800} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card p={18}>
          <div style={{ fontSize:12,fontWeight:800,color:T.textPri,marginBottom:12 }}>Problem vs Change per Customer</div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={customerTypeChart} layout="vertical" margin={{ left: 28, right: 28, top: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="customerProblemGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={T.red} stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#f97316" stopOpacity={0.75} />
                </linearGradient>
                <linearGradient id="customerChangeGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={T.teal} stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0.75} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={T.border} horizontal={false} strokeDasharray="4 4" />
              <XAxis type="number" tick={{ fill:T.textMute,fontSize:10 }} allowDecimals={false} />
              <YAxis type="category" dataKey="customer" width={110} tick={{ fill:T.textMute,fontSize:10 }} interval={0} />
              <Tooltip contentStyle={{ background:T.surfaceHi,border:`1px solid ${T.border}`,borderRadius:8,color:T.textPri }} />
              <Legend />
              <Bar dataKey="problem" name="Problem" stackId="customer" fill="url(#customerProblemGrad)" radius={[0, 8, 8, 0]}>
                <LabelList dataKey="problem" position="insideRight" fill="#fff" fontSize={10} fontWeight={800} />
              </Bar>
              <Bar dataKey="change" name="Change" stackId="customer" fill="url(#customerChangeGrad)" radius={[0, 8, 8, 0]}>
                <LabelList dataKey="change" position="right" fill={T.textPri} fontSize={10} fontWeight={800} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card p={0} style={{ overflow:'hidden' }}>
        <div style={{ padding:'13px 16px',borderBottom:`1px solid ${T.border}`,fontSize:12,fontWeight:800,color:T.textPri }}>Ringkasan Tiket per Customer</div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%',minWidth:860,borderCollapse:'collapse',fontSize:12 }}>
            <thead>
              <tr style={{ background:T.surfaceHi }}>
                {['Customer','Total Tiket','Problem','Change','Avg Resolution','Tiket / Month','% Problem'].map((head) => (
                  <th key={head} style={{ padding:'10px 12px',textAlign:'left',fontSize:10,color:T.textMute,textTransform:'uppercase',letterSpacing:'.06em' }}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.customerRows || []).map((row) => (
                <tr key={row.customer} style={{ borderTop:`1px solid ${T.border}` }}>
                  <td style={{ padding:'10px 12px',fontWeight:800,color:T.textPri }}>{row.customer}</td>
                  <td style={{ padding:'10px 12px',fontFamily:MONO }}>{row.totalTickets}</td>
                  <td style={{ padding:'10px 12px',fontFamily:MONO,color:T.red }}>{row.problem}</td>
                  <td style={{ padding:'10px 12px',fontFamily:MONO,color:T.teal }}>{row.change}</td>
                  <td style={{ padding:'10px 12px',fontFamily:MONO }}>{fmtHour(row.avgResolutionHours)}</td>
                  <td style={{ padding:'10px 12px',fontFamily:MONO }}>{row.ticketsPerMonth}</td>
                  <td style={{ padding:'10px 12px',fontFamily:MONO }}>{row.problemPct}%</td>
                </tr>
              ))}
              {!isFetching && (data?.customerRows || []).length === 0 && (
                <tr><td colSpan={7} style={{ padding:28,textAlign:'center',color:T.textMute }}>Tidak ada ticket SUP pada periode ini.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ display:'grid',gridTemplateColumns:'minmax(0,1.35fr) minmax(280px,.65fr)',gap:14 }}>
        <Card p={0} style={{ overflow:'hidden' }}>
          <div style={{ padding:'13px 16px',borderBottom:`1px solid ${T.border}`,fontSize:12,fontWeight:800,color:T.textPri }}>Kategori Solusi per Customer</div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%',minWidth:680,borderCollapse:'collapse',fontSize:12 }}>
              <thead>
                <tr style={{ background:T.surfaceHi }}>
                  {['Customer','Pecahan Kategori','Total'].map((head) => (
                    <th key={head} style={{ padding:'10px 12px',textAlign:'left',fontSize:10,color:T.textMute,textTransform:'uppercase',letterSpacing:'.06em' }}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {solutionCategoryRows.map((row) => (
                  <tr key={row.customer} style={{ borderTop:`1px solid ${T.border}` }}>
                    <td style={{ padding:'10px 12px',fontWeight:800,color:T.textPri,whiteSpace:'nowrap' }}>{row.customer}</td>
                    <td style={{ padding:'10px 12px' }}>
                      <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
                        {row.categories.map((item) => <Tag key={`${row.customer}-${item.category}`} color={item.category === 'Other' ? T.textMute : T.indigoHi} lo={item.category === 'Other' ? T.surfaceHi : T.indigoLo}>{item.category}: {item.count}</Tag>)}
                      </div>
                    </td>
                    <td style={{ padding:'10px 12px',fontFamily:MONO,fontWeight:800 }}>{row.total}</td>
                  </tr>
                ))}
                {!isFetching && solutionCategoryRows.length === 0 && (
                  <tr><td colSpan={3} style={{ padding:28,textAlign:'center',color:T.textMute }}>Tidak ada kategori solusi pada periode ini.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
        <Card p={18}>
          <div style={{ fontSize:12,fontWeight:800,color:T.textPri,marginBottom:10 }}>Top Jenis Tiket Berdasarkan Topik</div>
          <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
            {(data?.topTopics || []).map((item, index) => (
              <div key={item.topic} style={{ display:'flex',alignItems:'center',gap:10 }}>
                <div style={{ width:24,fontFamily:MONO,color:T.textMute,fontSize:11 }}>#{index + 1}</div>
                <div style={{ flex:1,color:T.textPri,fontSize:12 }}>{item.topic}</div>
                <Tag color={T.amber} lo={T.amberLo}>{item.count}</Tag>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
