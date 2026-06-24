import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { T, DISPLAY, MONO } from '../theme/tokens';
import { Card, Btn, Inp, Lbl, Modal, MHead, Tag } from './ui/Primitives';
import api from '../lib/api';
import sdtLogoUrl from '../assets/sdt-logo.png';

const currentQuarter = () => `Q${Math.floor(new Date().getMonth() / 3) + 1}`;
const quarterRange = (year, quarter) => ({
  Q1: [`${year}-01-01`, `${year}-03-31`],
  Q2: [`${year}-04-01`, `${year}-06-30`],
  Q3: [`${year}-07-01`, `${year}-09-30`],
  Q4: [`${year}-10-01`, `${year}-12-31`],
}[quarter] || [`${year}-01-01`, `${year}-03-31`]);

const safeName = (value) => String(value || 'job-report').replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const fmtTicket = (value) => Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });
const fmtDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
};
const fmtDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).replace('.', ':');
};
const statusColor = (statusCategoryKey) => {
  if (statusCategoryKey === 'done') return [T.green, T.greenLo];
  if (statusCategoryKey === 'indeterminate') return [T.amber, T.amberLo];
  return [T.textMute, T.surfaceHi];
};
const LOGO_URL = sdtLogoUrl;

const pdf = {
  margin: 15,
  labelX: 16,
  colonX: 64,
  valueX: 68,
  rightLabelX: 136,
  rightColonX: 160,
  rightValueX: 164,
};

const setText = (doc, size = 10, bold = false) => {
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  doc.setFontSize(size);
  doc.setTextColor(0, 0, 0);
};
const line = (doc, label, value, y, options = {}) => {
  setText(doc, options.size || 10, options.boldLabel);
  doc.text(label, options.labelX || pdf.labelX, y);
  doc.text(':', options.colonX || pdf.colonX, y);
  const text = options.emptyAsBlank && !value ? '' : String(value || '-');
  if (text) doc.text(doc.splitTextToSize(text, options.width || 120), options.valueX || pdf.valueX, y);
};
const section = (doc, title, y) => {
  setText(doc, 10, true);
  doc.setFont('helvetica', 'bolditalic');
  doc.text(title, pdf.labelX, y);
  doc.line(pdf.labelX, y + 1, pdf.labelX + doc.getTextWidth(title), y + 1);
  return y + 8;
};
const checkbox = (doc, x, y, label, checked) => {
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.45);
  doc.rect(x, y - 4.3, 5.2, 5.2);
  if (checked) {
    doc.setLineWidth(0.55);
    doc.line(x + 1.1, y - 3.2, x + 4.1, y - 0.2);
    doc.line(x + 4.1, y - 3.2, x + 1.1, y - 0.2);
  }
  setText(doc, 10);
  doc.text(label, x + 6.5, y);
};
const boxedText = (doc, text, x, y, w, h, options = {}) => {
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.45);
  doc.rect(x, y, w, h);
  setText(doc, 10);
  const value = options.emptyAsBlank && !text ? '' : String(text || '-');
  if (value) doc.text(doc.splitTextToSize(value, w - 2), x + 1.5, y + 5);
};
const supportActivityBox = (doc, title, detailLabel, detailText, checked, y) => {
  checkbox(doc, 16, y, title, checked);
  setText(doc, 10);
  doc.text(detailLabel, 23, y + 10);
  doc.text(':', 64, y + 10);
  boxedText(doc, checked ? detailText : '', 68, y + 4, 124, 22, { emptyAsBlank: true });
  return y + 32;
};
const imageSize = (dataUrl) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve({ width: img.width, height: img.height });
  img.onerror = () => resolve({ width: 1200, height: 800 });
  img.src = dataUrl;
});
const imageUrlToDataUrl = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Logo unavailable');
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const generateJobPdf = async (detail, manual) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const isChange = detail.type === 'change' || String(detail.issueTypeName || '').toLowerCase().includes('change');
  const actualAt = detail.actualStartDate || detail.createdAt;
  const engineer = detail.assigneeName || '-';
  const caseStatus = String(detail.statusName || '').toLowerCase();
  const statusDone = detail.statusCategoryKey === 'done' || caseStatus.includes('done') || caseStatus.includes('resolved') || caseStatus.includes('closed');
  const issueRemark = detail.comments?.find((comment) => comment.remark)?.remark || '';
  const worklogRows = detail.worklogs?.length ? detail.worklogs : [{ objective: detail.summary, startedAt: actualAt, remark: '', id: detail.key }];

  try {
    const logoDataUrl = await imageUrlToDataUrl(LOGO_URL);
    doc.addImage(logoDataUrl, 'PNG', 16, 12, 46, 18);
  } catch {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(8, 33, 68);
    doc.text('SERAPHIM', 18, 18);
    doc.setFontSize(6);
    doc.text('DIGITAL TECHNOLOGY', 43, 23);
  }
  setText(doc, 14, true);
  doc.text('JOB REPORT', 105, 44, { align: 'center' });

  line(doc, 'REPORT DATE', fmtDate(actualAt), 56, { labelX: 136, colonX: 160, valueX: 164 });
  line(doc, 'Case ID', detail.key, 62, { labelX: 136, colonX: 160, valueX: 164 });

  let y = section(doc, 'General Info', 74);
  line(doc, 'Company Name', detail.customer?.name, y); y += 6;
  line(doc, 'Company Address', detail.customer?.address, y, { width: 95 }); y += 13;
  line(doc, 'Customer PIC', manual.pic, y); y += 6;
  line(doc, 'Contact no', manual.contactNo, y); y += 6;
  line(doc, 'Email', detail.reporterEmail || '-', y); y += 11;

  y = section(doc, 'Case Timestamp', y);
  line(doc, 'Engineer Response Time', fmtDateTime(actualAt), y);
  line(doc, 'Call received by', engineer, y, { labelX: pdf.rightLabelX, colonX: pdf.rightColonX, valueX: pdf.rightValueX }); y += 6;
  line(doc, 'Support Start Time', fmtDateTime(detail.actualStartDate || actualAt), y);
  line(doc, 'Call date/time', fmtDateTime(detail.createdAt || actualAt), y, { labelX: pdf.rightLabelX, colonX: pdf.rightColonX, valueX: pdf.rightValueX }); y += 6;
  line(doc, 'Support End Time', fmtDateTime(detail.actualEndDate || detail.resolutionDate), y);
  line(doc, 'Engineer Name', engineer, y, { labelX: pdf.rightLabelX, colonX: pdf.rightColonX, valueX: pdf.rightValueX }); y += 12;

  y = section(doc, 'Product Details', y);
  line(doc, 'Product Name', detail.productName, y); y += 6;
  line(doc, 'Product Type', detail.productType || detail.productName, y); y += 6;
  line(doc, 'Item Category', '', y, { emptyAsBlank: true });
  checkbox(doc, 68, y, 'Hardware', false);
  checkbox(doc, 92, y, 'Software', false); y += 13;

  y = section(doc, 'Support Activity', y);
  checkbox(doc, 16, y + 4, 'Preventive', false);
  y += 16;
  const correctiveY = y;
  y = supportActivityBox(doc, 'Corrective', 'Issue Description', detail.summary, !isChange, y);
  line(doc, 'Severity', !isChange ? detail.priority : '', correctiveY + 31, { labelX: 23, colonX: 64, valueX: 68, emptyAsBlank: true });
  y += 8;
  y = supportActivityBox(doc, 'Enhancement', 'Items requested', detail.summary, isChange, y);

  doc.addPage();
  y = section(doc, 'Activity Table', 18);
  autoTable(doc, {
    startY: y + 2,
    theme: 'grid',
    head: [['No', 'Objective', 'Date & Time', 'Remark']],
    body: worklogRows.map((row, index) => [index + 1, row.objective || '-', fmtDateTime(row.startedAt), row.remark || '']),
    styles: { fontSize: 9, cellPadding: 2.2, textColor: 0, lineColor: 0, lineWidth: 0.25 },
    headStyles: { fillColor: [210, 210, 210], textColor: 0, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 10, halign: 'right' }, 1: { cellWidth: 62 }, 2: { cellWidth: 34 }, 3: { cellWidth: 74 } },
    margin: { left: 16, right: 16 },
  });
  y = Math.max(doc.lastAutoTable.finalY + 28, 112);
  line(doc, 'Additional Remarks', '', y, { colonX: 58, valueX: 62, emptyAsBlank: true });
  boxedText(doc, issueRemark, 62, y - 6, 130, 22);

  y += 38;
  y = section(doc, 'Ticket Information', y);
  line(doc, 'Ticket Used', `${Number(detail.ticketUsed || 0) > 0 ? 'Yes' : 'No'} - ${fmtTicket(detail.ticketUsed)} Ticket`, y); y += 6;
  line(doc, 'Ticket Total', fmtTicket(detail.totalTicket), y); y += 6;
  line(doc, 'Remaining Ticket', fmtTicket(detail.remainingTicket), y); y += 12;

  y = section(doc, 'Support Signoff', y);
  line(doc, 'Case Status', '', y + 8, { colonX: 58, valueX: 62, emptyAsBlank: true });
  checkbox(doc, 62, y + 8, 'Complete / Solved', statusDone);
  checkbox(doc, 62, y + 15, 'Escalated', !statusDone && caseStatus.includes('escalat'));
  checkbox(doc, 62, y + 22, 'Pending Customer Action', !statusDone && caseStatus.includes('pending'));
  setText(doc, 10);
  const signY = Math.max(y + 58, 220);
  doc.text('Customer Name', 42, signY, { align: 'center' });
  doc.text('Engineer Name', 155, signY, { align: 'center' });
  doc.line(24, signY + 30, 70, signY + 30);
  doc.line(128, signY + 30, 190, signY + 30);
  doc.text(manual.pic || '-', 47, signY + 36, { align: 'center' });
  doc.text(engineer, 159, signY + 36, { align: 'center' });

  doc.addPage();
  y = section(doc, 'Lampiran', 18);
  const images = detail.imageAttachments || [];
  if (!images.length) {
    setText(doc, 10);
    doc.text('Tidak ada lampiran gambar pada tiket Jira.', 16, y + 8);
  }
  for (const attachment of images) {
    const size = await imageSize(attachment.dataUrl);
    const maxW = 178;
    const maxH = 105;
    const ratio = Math.min(maxW / size.width, maxH / size.height);
    const w = size.width * ratio;
    const h = size.height * ratio;
    if (y + h + 16 > 282) {
      doc.addPage();
      y = section(doc, 'Lampiran', 18);
    }
    setText(doc, 9, true);
    doc.text(attachment.filename, 16, y);
    doc.addImage(attachment.dataUrl, attachment.mimeType.includes('png') ? 'PNG' : 'JPEG', 16, y + 4, w, h);
    y += h + 14;
  }

  doc.save(`job-report-${safeName(detail.key)}.pdf`);
};

export function JobReportView() {
  const [mode, setMode] = useState('quarter');
  const [year, setYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState(currentQuarter());
  const [dateFrom, setDateFrom] = useState(quarterRange(year, quarter)[0]);
  const [dateTo, setDateTo] = useState(quarterRange(year, quarter)[1]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [manual, setManual] = useState({ pic: '', contactNo: '' });

  const effectiveRange = useMemo(() => {
    if (mode === 'quarter') return quarterRange(year, quarter);
    return [dateFrom, dateTo];
  }, [dateFrom, dateTo, mode, quarter, year]);

  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ['job-report', effectiveRange[0], effectiveRange[1]],
    queryFn: async () => {
      const res = await api.get('/reports/jobs', { params: { startDate: effectiveRange[0], endDate: effectiveRange[1] } });
      return res.data;
    },
    enabled: Boolean(effectiveRange[0] && effectiveRange[1]),
  });

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const items = data?.items || [];
    if (!needle) return items;
    return items.filter((item) => `${item.key || ''} ${item.summary || ''} ${item.customer || ''} ${item.status || ''}`.toLowerCase().includes(needle));
  }, [data, search]);

  const openPdfModal = async (item) => {
    setSelectedItem(item);
    setDetail(null);
    setManual({ pic: '', contactNo: '' });
    setModalOpen(true);
    setLoadingDetail(true);
    try {
      const res = await api.get(`/reports/jobs/${item.key}`);
      setDetail(res.data);
    } catch (fetchError) {
      toast.error(fetchError?.response?.data?.error || 'Gagal mengambil detail Jira untuk job report.');
      setModalOpen(false);
    } finally {
      setLoadingDetail(false);
    }
  };

  const submitPdf = async (event) => {
    event.preventDefault();
    if (!manual.pic.trim()) {
      toast.error('Customer PIC wajib diisi.');
      return;
    }
    if (!detail) return;
    setPdfBusy(true);
    try {
      await generateJobPdf(detail, manual);
      setModalOpen(false);
    } catch {
      toast.error('Gagal membuat PDF Job Report.');
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card p={18}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, color: T.textMute, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.07em' }}>Reports</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: T.textPri, fontFamily: DISPLAY, marginBottom: 6 }}>Job Report</div>
            <div style={{ fontSize: 12, color: T.textMute, lineHeight: 1.5, maxWidth: 760 }}>
              List SUP Changes. PDF otomatis mengambil detail Jira, worklog, remark, mapping customer, dan lampiran gambar.
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
          <Btn v="primary" onClick={() => refetch()} disabled={isFetching} style={{ height: 36 }}>{isFetching ? 'Loading...' : 'Refresh'}</Btn>
        </div>
      </Card>

      {error && <Card p={14} style={{ borderColor: `${T.red}55`, color: T.red, fontSize: 12 }}>{error?.response?.data?.error || error.message || 'Gagal memuat job report.'}</Card>}

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
                    <td style={{ padding: '11px 12px', whiteSpace: 'nowrap' }}><Tag color={color} lo={lo} small>{item.status || '-'}</Tag></td>
                    <td style={{ padding: '11px 12px', color: T.textSec, fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDateTime(item.createdAt)}</td>
                    <td style={{ padding: '11px 12px', color: T.textSec, fontSize: 12, whiteSpace: 'nowrap' }}>
                      <span style={{ color: T.teal, fontWeight: 800 }}>{fmtTicket(item.ticketUsed)}</span>
                      <span style={{ color: T.textMute }}> / {fmtTicket(item.totalTicket)}</span>
                    </td>
                    <td style={{ padding: '11px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Btn sz="sm" v="ghost" onClick={() => openPdfModal(item)} disabled={loadingDetail && selectedItem?.key === item.key}>[PDF]</Btn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} width={520}>
        <MHead title={`Download Job Report ${selectedItem?.key || ''}`} sub="Isi data manual yang belum tersedia dari Jira." onClose={() => setModalOpen(false)} />
        {loadingDetail ? (
          <div style={{ color: T.textMute, fontSize: 13 }}>Mengambil detail Jira...</div>
        ) : (
          <form onSubmit={submitPdf} style={{ display: 'grid', gap: 14 }}>
            <Inp label="Customer PIC" required value={manual.pic} onChange={(event) => setManual((prev) => ({ ...prev, pic: event.target.value }))} placeholder="Nama PIC customer" />
            <Inp label="Contact no" value={manual.contactNo} onChange={(event) => setManual((prev) => ({ ...prev, contactNo: event.target.value }))} placeholder="Nomor kontak PIC" />
            <Card p={12} style={{ background: T.surfaceHi, boxShadow: 'none' }}>
              <div style={{ fontSize: 11, color: T.textMute, marginBottom: 4 }}>Preview data Jira</div>
              <div style={{ fontSize: 12, color: T.textPri, lineHeight: 1.6 }}>
                <div>Company: <strong>{detail?.customer?.name || '-'}</strong></div>
                <div>Reporter Email: <strong>{detail?.reporterEmail || '-'}</strong></div>
                <div>Engineer: <strong>{detail?.assigneeName || '-'}</strong></div>
                <div>Worklog: <strong>{detail?.worklogs?.length || 0}</strong> item</div>
                <div>Lampiran gambar: <strong>{detail?.imageAttachments?.length || 0}</strong> item</div>
              </div>
            </Card>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn type="button" v="ghost" onClick={() => setModalOpen(false)}>Batal</Btn>
              <Btn type="submit" v="teal" disabled={pdfBusy || !detail}>{pdfBusy ? 'Membuat PDF...' : 'Download PDF'}</Btn>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
