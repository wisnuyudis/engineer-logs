import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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
const fmtPeriod = (period) => `${period?.startDate || '-'} s/d ${period?.endDate || '-'}`;
const safeName = (value) => String(value || 'report').replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();

const addPdfFooter = (doc) => {
  const pageCount = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Page ${page} / ${pageCount}`, doc.internal.pageSize.getWidth() - 18, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
  }
};

const pdfPage = (doc) => ({
  width: doc.internal.pageSize.getWidth(),
  height: doc.internal.pageSize.getHeight(),
  margin: 12,
});

const ensurePdfSpace = (doc, y, needed = 30) => {
  const { height, margin } = pdfPage(doc);
  if (y + needed < height - margin) return y;
  doc.addPage();
  return margin;
};

const drawPdfSection = (doc, title, y) => {
  y = ensurePdfSpace(doc, y, 18);
  const { width, margin } = pdfPage(doc);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text(title.toUpperCase(), margin, y);
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y + 3, width - margin, y + 3);
  return y + 9;
};

const drawPdfCards = (doc, cards, y) => {
  const { width, margin } = pdfPage(doc);
  const gap = 4;
  const cardWidth = (width - margin * 2 - gap * (cards.length - 1)) / cards.length;
  cards.forEach((card, index) => {
    const x = margin + index * (cardWidth + gap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(219, 226, 239);
    doc.roundedRect(x, y, cardWidth, 22, 3, 3, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(String(card.label).toUpperCase(), x + 4, y + 7);
    doc.setFontSize(16);
    doc.setTextColor(card.color || '#111827');
    doc.text(String(card.value), x + 4, y + 17);
  });
  return y + 30;
};

const drawPdfBarChart = (doc, title, rows, keys, y, options = {}) => {
  y = drawPdfSection(doc, title, y);
  const { width, height, margin } = pdfPage(doc);
  const labelWidth = options.labelWidth || 46;
  const rowHeight = options.rowHeight || 7;
  const valuePad = 10;
  const chartWidth = width - margin * 2 - labelWidth - valuePad;
  const bottomLimit = height - margin;
  const max = Math.max(1, ...rows.flatMap((row) => keys.map((key) => Number(row[key] || 0))));
  const colors = { problem: [239, 68, 68], change: [20, 184, 166], total: [99, 102, 241] };
  const visibleRows = rows.slice(0, options.limit || 12);

  y = ensurePdfSpace(doc, y, Math.max(18, visibleRows.length * rowHeight + 12));
  visibleRows.forEach((row, index) => {
    if (y + rowHeight > bottomLimit) {
      doc.addPage();
      y = margin;
    }
    const cy = y;
    const label = String(row.label || row.customer || row.month || '-');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(51, 65, 85);
    doc.text(doc.splitTextToSize(label, labelWidth - 2)[0], margin, cy + 4.5);

    let x = margin + labelWidth;
    keys.forEach((key) => {
      const value = Number(row[key] || 0);
      const rawWidth = value ? Math.max(5, (value / max) * chartWidth) : 0;
      const remainingWidth = Math.max(0, margin + labelWidth + chartWidth - x);
      const barWidth = Math.min(rawWidth, remainingWidth);
      doc.setFillColor(...(colors[key] || [100, 116, 139]));
      if (barWidth > 0) doc.roundedRect(x, cy, barWidth, 4.8, 1.4, 1.4, 'F');
      if (value > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(15, 23, 42);
        doc.text(String(value), Math.min(x + barWidth + 1.5, width - margin - 4), cy + 4);
      }
      x += barWidth;
    });
    y += rowHeight;
  });
  return y + 8;
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
    if (type === 'customer' && !selectedCustomer) return;

    const issues = selectedCustomer
      ? (data.issues || []).filter((issue) => issue.customer === selectedCustomer)
      : (data.issues || []);
    const customerRows = selectedCustomer
      ? (data.customerRows || []).filter((row) => row.customer === selectedCustomer)
      : (data.customerRows || []);
    const solutionRows = selectedCustomer
      ? solutionCategoryRows.filter((row) => row.customer === selectedCustomer)
      : solutionCategoryRows;
    const trendRows = selectedCustomer
      ? (data.monthlyTrend || []).filter((row) => row.customer === selectedCustomer)
      : trendChart;
    const customerChartRows = selectedCustomer
      ? customerRows.map((row) => ({ customer: row.customer, problem: row.problem, change: row.change }))
      : customerTypeChart;
    const topTopicRows = selectedCustomer
      ? Object.values(issues.reduce((acc, issue) => {
          const topic = issue.summary || issue.key;
          acc[topic] = acc[topic] || { topic, count: 0 };
          acc[topic].count += 1;
          return acc;
        }, {})).sort((a, b) => b.count - a.count)
      : (data.topTopics || []);
    const title = selectedCustomer ? `Executive Report - ${selectedCustomer}` : 'Executive Summary - SUP Problem & Change';

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = 14;
    const { margin } = pdfPage(doc);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(15, 23, 42);
    doc.text(doc.splitTextToSize(title, doc.internal.pageSize.getWidth() - margin * 2), margin, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Periode: ${fmtPeriod(data.period)} | Generated ${new Date().toLocaleString('id-ID')}`, margin, y);
    y += 8;

    y = drawPdfCards(doc, [
      { label: 'Total Tiket', value: issues.length, color: '#4f46e5' },
      { label: 'Problem', value: issues.filter((issue) => issue.type === 'problem').length, color: '#ef4444' },
      { label: 'Change', value: issues.filter((issue) => issue.type === 'change').length, color: '#14b8a6' },
      { label: 'Customer', value: selectedCustomer ? 1 : (data.totals?.customers || 0), color: '#f59e0b' },
    ], y);

    y = drawPdfBarChart(doc, 'Tren Tiket per Bulan', trendRows.map((row) => ({ label: row.month, problem: row.problem, change: row.change })), ['problem', 'change'], y, { limit: 8, labelWidth: 34 });
    y = drawPdfBarChart(doc, 'Problem vs Change per Customer', customerChartRows.map((row) => ({ label: row.customer, problem: row.problem, change: row.change })), ['problem', 'change'], y, { limit: 10, labelWidth: 52 });

    y = drawPdfSection(doc, 'Ringkasan Tiket per Customer', y);
    autoTable(doc, {
      startY: y,
      head: [['Customer', 'Total', 'Problem', 'Change', 'Avg Resolution', 'Tiket / Month', '% Problem']],
      body: customerRows.map((row) => [row.customer, row.totalTickets, row.problem, row.change, fmtHour(row.avgResolutionHours), row.ticketsPerMonth, `${row.problemPct}%`]),
      theme: 'grid',
      headStyles: { fillColor: [238, 242, 247], textColor: [71, 85, 105], fontStyle: 'bold' },
      styles: { fontSize: 7, cellPadding: 1.6 },
      margin: { left: margin, right: margin },
    });
    y = (doc.lastAutoTable?.finalY || y) + 10;

    y = drawPdfSection(doc, 'Kategori Solusi per Customer', y);
    autoTable(doc, {
      startY: y,
      head: [['Customer', 'Pecahan Kategori', 'Total']],
      body: solutionRows.map((row) => [
        row.customer,
        row.categories.map((item) => `${item.category}: ${item.count}`).join(', '),
        row.total,
      ]),
      theme: 'grid',
      headStyles: { fillColor: [238, 242, 247], textColor: [71, 85, 105], fontStyle: 'bold' },
      styles: { fontSize: 7, cellPadding: 1.6 },
      margin: { left: margin, right: margin },
      columnStyles: { 1: { cellWidth: 108 } },
    });
    y = (doc.lastAutoTable?.finalY || y) + 10;

    if (!selectedCustomer) {
      y = drawPdfSection(doc, 'Top Jenis Tiket Berdasarkan Topik', y);
      autoTable(doc, {
        startY: y,
        head: [['#', 'Topik', 'Count']],
        body: topTopicRows.map((item, index) => [index + 1, item.topic, item.count]),
        theme: 'grid',
        headStyles: { fillColor: [238, 242, 247], textColor: [71, 85, 105], fontStyle: 'bold' },
        styles: { fontSize: 7, cellPadding: 1.6 },
        margin: { left: margin, right: margin },
        columnStyles: { 1: { cellWidth: 140 } },
      });
      y = (doc.lastAutoTable?.finalY || y) + 10;
    }

    y = drawPdfSection(doc, 'Detail SUP', y);
    autoTable(doc, {
      startY: y,
      head: [['Issue', 'Customer', 'Type', 'Topic', 'Status', 'Created', 'Actual At', 'Actual End', 'Resolution']],
      body: issues.map((issue) => [
        issue.key,
        issue.customer,
        issue.type,
        selectedCustomer ? (issue.summary || '-') : (issue.ticketTopic || '-'),
        issue.status || '-',
        issue.createdAt ? issue.createdAt.slice(0, 10) : '-',
        issue.actualStartDate ? issue.actualStartDate.slice(0, 10) : '-',
        issue.actualEndDate ? issue.actualEndDate.slice(0, 10) : '-',
        fmtHour(issue.resolutionHours),
      ]),
      theme: 'grid',
      headStyles: { fillColor: [238, 242, 247], textColor: [71, 85, 105], fontStyle: 'bold' },
      styles: { fontSize: 6.4, cellPadding: 1.4, overflow: 'linebreak' },
      margin: { left: margin, right: margin },
      columnStyles: { 0: { cellWidth: 16 }, 1: { cellWidth: 22 }, 2: { cellWidth: 13 }, 3: { cellWidth: 48 }, 4: { cellWidth: 18 }, 5: { cellWidth: 17 }, 6: { cellWidth: 17 }, 7: { cellWidth: 17 }, 8: { cellWidth: 15 } },
    });

    addPdfFooter(doc);
    doc.save(`${safeName(title)}-${data.period?.startDate || 'start'}-${data.period?.endDate || 'end'}.pdf`);
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
