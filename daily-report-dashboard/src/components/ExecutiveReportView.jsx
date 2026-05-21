import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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

export function ExecutiveReportView() {
  const [mode, setMode] = useState('quarter');
  const [year, setYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState(currentQuarter());
  const [dateFrom, setDateFrom] = useState(quarterRange(year, quarter)[0]);
  const [dateTo, setDateTo] = useState(quarterRange(year, quarter)[1]);

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
    (data?.customerRows || []).slice(0, 10).map((row) => ({
      customer: row.customer.length > 18 ? `${row.customer.slice(0, 18)}...` : row.customer,
      problem: row.problem,
      change: row.change,
    }))
  ), [data]);

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
              <CartesianGrid stroke={T.border} vertical={false} />
              <XAxis dataKey="month" tick={{ fill:T.textMute,fontSize:11 }} />
              <YAxis tick={{ fill:T.textMute,fontSize:11 }} />
              <Tooltip contentStyle={{ background:T.surfaceHi,border:`1px solid ${T.border}`,borderRadius:8,color:T.textPri }} />
              <Legend />
              <Bar dataKey="problem" name="Problem" stackId="a" fill={T.red} />
              <Bar dataKey="change" name="Change" stackId="a" fill={T.teal} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card p={18}>
          <div style={{ fontSize:12,fontWeight:800,color:T.textPri,marginBottom:12 }}>Problem vs Change per Customer</div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={customerTypeChart}>
              <CartesianGrid stroke={T.border} vertical={false} />
              <XAxis dataKey="customer" tick={{ fill:T.textMute,fontSize:10 }} />
              <YAxis tick={{ fill:T.textMute,fontSize:11 }} />
              <Tooltip contentStyle={{ background:T.surfaceHi,border:`1px solid ${T.border}`,borderRadius:8,color:T.textPri }} />
              <Legend />
              <Bar dataKey="problem" name="Problem" fill={T.red} />
              <Bar dataKey="change" name="Change" fill={T.teal} />
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

      <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:14 }}>
        <Card p={18}>
          <div style={{ fontSize:12,fontWeight:800,color:T.textPri,marginBottom:10 }}>Kategori Solusi per Customer</div>
          <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
            {(data?.solutionCategories || []).slice(0, 8).map((row) => (
              <div key={row.customer} style={{ borderBottom:`1px solid ${T.border}`,paddingBottom:9 }}>
                <div style={{ fontSize:12,fontWeight:800,color:T.textPri,marginBottom:6 }}>{row.customer}</div>
                <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
                  {row.categories.slice(0, 4).map((item) => <Tag key={item.category} color={T.indigoHi} lo={T.indigoLo}>{item.category}: {item.count}</Tag>)}
                </div>
              </div>
            ))}
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
