import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { T, DISPLAY, MONO } from '../theme/tokens';
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

const fmtDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const fmtTicket = (value) => Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });
const safeName = (value) => String(value || 'job-report').replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();

const statusColor = (statusCategoryKey) => {
  if (statusCategoryKey === 'done') return [T.green, T.greenLo];
  if (statusCategoryKey === 'indeterminate') return [T.amber, T.amberLo];
  return [T.textMute, T.surfaceHi];
};

const downloadJobPdf = (item) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text('Job Report', margin, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('Draft template - detail format will be refined later.', margin, 25);

  autoTable(doc, {
    startY: 34,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [15, 118, 110], textColor: 255 },
    head: [['Field', 'Value']],
    body: [
      ['SUP Key', item.key || '-'],
      ['Customer', item.customer || '-'],
      ['Summary', item.summary || '-'],
      ['Type', item.issueTypeName || '[System] Change'],
      ['Status', item.status || '-'],
      ['Priority', item.priority || '-'],
      ['Created', fmtDateTime(item.createdAt)],
      ['Updated', fmtDateTime(item.updatedAt)],
      ['Actual Start', fmtDateTime(item.actualStartDate)],
      ['Actual End', fmtDateTime(item.actualEndDate)],
      ['Ticket Used', fmtTicket(item.ticketUsed)],
      ['Total Ticket', fmtTicket(item.totalTicket)],
      ['Remaining Ticket', fmtTicket(item.remainingTicket)],
    ],
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 38 },
      1: { cellWidth: 130 },
    },
  });

  doc.save(`job-report-${safeName(item.key)}.pdf`);
};

export function JobReportView() {
  const [mode, setMode] = useState('quarter');
  const [year, setYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState(currentQuarter());
  const [dateFrom, setDateFrom] = useState(quarterRange(year, quarter)[0]);
  const [dateTo, setDateTo] = useState(quarterRange(year, quarter)[1]);
  const [search, setSearch] = useState('');

  const effectiveRange = useMemo(() => {
    if (mode === 'quarter') return quarterRange(year, quarter);
    return [dateFrom, dateTo];
  }, [dateFrom, dateTo, mode, quarter, year]);

  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ['job-report', effectiveRange[0], effectiveRange[1]],
    queryFn: async () => {
      const res = await api.get('/reports/jobs', {
        params: { startDate: effectiveRange[0], endDate: effectiveRange[1] },
      });
      return res.data;
    },
    enabled: Boolean(effectiveRange[0] && effectiveRange[1]),
  });

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const items = data?.items || [];
    if (!needle) return items;
    return items.filter((item) => (
      `${item.key || ''} ${item.summary || ''} ${item.customer || ''} ${item.status || ''}`.toLowerCase().includes(needle)
    ));
  }, [data, search]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card p={18}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, color: T.textMute, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.07em' }}>Reports</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: T.textPri, fontFamily: DISPLAY, marginBottom: 6 }}>Job Report</div>
            <div style={{ fontSize: 12, color: T.textMute, lineHeight: 1.5, maxWidth: 760 }}>
              List SUP dengan issue type Changes. Tombol PDF di kanan masih memakai draft template sampai detail report final ditentukan.
            </div>
          </div>
          <Tag color={T.teal} lo={T.tealLo}>{data?.totals?.changes || 0} Changes</Tag>
        </div>
      </Card>

      <Card p={16}>
        <div style={{ display: 'grid', gridTemplateColumns: '130px 120px minmax(0,1fr) minmax(0,1fr) auto', gap: 10, alignItems: 'end' }}>
          <div>
            <Lbl>Mode</Lbl>
            <select value={mode} onChange={(event) => setMode(event.target.value)} style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: `1.5px solid ${T.border}`, background: T.surfaceHi, color: T.textPri }}>
              <option value="quarter">Quarter</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          {mode === 'quarter' ? (
            <>
              <Inp label="Year" type="number" value={year} onChange={(event) => setYear(Number(event.target.value || new Date().getFullYear()))} />
              <div>
                <Lbl>Quarter</Lbl>
                <select value={quarter} onChange={(event) => setQuarter(event.target.value)} style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: `1.5px solid ${T.border}`, background: T.surfaceHi, color: T.textPri }}>
                  {['Q1', 'Q2', 'Q3', 'Q4'].map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <Inp label="Search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="SUP key, customer, summary..." />
            </>
          ) : (
            <>
              <Inp label="Start Date" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              <Inp label="End Date" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
              <Inp label="Search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="SUP key, customer, summary..." />
            </>
          )}
          <Btn v="primary" onClick={() => refetch()} disabled={isFetching} style={{ height: 36 }}>
            {isFetching ? 'Loading...' : 'Refresh'}
          </Btn>
        </div>
      </Card>

      {error && (
        <Card p={14} style={{ borderColor: `${T.red}55`, color: T.red, fontSize: 12 }}>
          {error?.response?.data?.error || error.message || 'Gagal memuat job report.'}
        </Card>
      )}

      <Card p={0} style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
            <thead>
              <tr style={{ background: T.surfaceHi, color: T.textMute, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                {['SUP', 'Customer', 'Summary', 'Status', 'Created', 'Ticket', 'Action'].map((head) => (
                  <th key={head} style={{ padding: '11px 12px', textAlign: head === 'Action' ? 'right' : 'left', borderBottom: `1px solid ${T.border}` }}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isFetching ? (
                <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: T.textMute, fontSize: 13 }}>Memuat SUP Changes...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: T.textMute, fontSize: 13 }}>Tidak ada SUP Changes untuk filter ini.</td></tr>
              ) : rows.map((item) => {
                const [color, lo] = statusColor(item.statusCategoryKey);
                return (
                  <tr key={item.key} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td style={{ padding: '11px 12px', color: T.textPri, fontFamily: MONO, fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>{item.key}</td>
                    <td style={{ padding: '11px 12px', color: T.textPri, fontSize: 12, fontWeight: 700, maxWidth: 190 }}>{item.customer || '-'}</td>
                    <td style={{ padding: '11px 12px', color: T.textSec, fontSize: 12, minWidth: 280 }}>
                      <div style={{ color: T.textPri, fontWeight: 700, marginBottom: 3 }}>{item.summary || '-'}</div>
                      <div style={{ color: T.textMute, fontSize: 11 }}>{item.issueTypeName || '[System] Change'}</div>
                    </td>
                    <td style={{ padding: '11px 12px', whiteSpace: 'nowrap' }}>
                      <Tag color={color} lo={lo} small>{item.status || '-'}</Tag>
                    </td>
                    <td style={{ padding: '11px 12px', color: T.textSec, fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDateTime(item.createdAt)}</td>
                    <td style={{ padding: '11px 12px', color: T.textSec, fontSize: 12, whiteSpace: 'nowrap' }}>
                      <span style={{ color: T.teal, fontWeight: 800 }}>{fmtTicket(item.ticketUsed)}</span>
                      <span style={{ color: T.textMute }}> / {fmtTicket(item.totalTicket)}</span>
                    </td>
                    <td style={{ padding: '11px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Btn sz="sm" v="ghost" onClick={() => downloadJobPdf(item)}>[PDF]</Btn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
