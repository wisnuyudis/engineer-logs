import { ROLES } from '../constants/taxonomy';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmtDur = m => {
  const total = Number(m || 0);
  const h = Math.floor(total / 60);
  const mn = total % 60;
  return h ? `${h}j ${mn}m` : `${mn}m`;
};

const safeName = (value) => String(value || 'report').replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();

const addFooter = (doc) => {
  const pageCount = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Page ${page} / ${pageCount}`, doc.internal.pageSize.getWidth() - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
  }
};

const drawTitle = (doc, title, subtitle) => {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(title, 14, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(subtitle, 14, 23);
  return 32;
};

const drawCards = (doc, cards, y) => {
  const width = doc.internal.pageSize.getWidth();
  const gap = 4;
  const cardWidth = (width - 28 - gap * (cards.length - 1)) / cards.length;
  cards.forEach((card, index) => {
    const x = 14 + index * (cardWidth + gap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(219, 226, 239);
    doc.roundedRect(x, y, cardWidth, 20, 3, 3, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(String(card.label).toUpperCase(), x + 4, y + 7);
    doc.setFontSize(14);
    doc.setTextColor(card.color || '#111827');
    doc.text(String(card.value), x + 4, y + 16);
  });
  return y + 28;
};

const drawSection = (doc, title, y) => {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y > pageHeight - 24) {
    doc.addPage();
    y = 16;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text(title.toUpperCase(), 14, y);
  doc.setDrawColor(226, 232, 240);
  doc.line(14, y + 3, doc.internal.pageSize.getWidth() - 14, y + 3);
  return y + 9;
};

export function exportCSV(rows, members, ACTS) {
  const headers = [
    "Tanggal","Member","Role","Tim","Source","Kategori",
    "Ticket ID","Judul / Topik","Customer",
    "Jam Mulai","Jam Selesai","Durasi (mnt)","Status","Catatan"
  ];
  const esc = v => {
    const s = String(v == null ? "" : v);
    return (s.includes(",") || s.includes('"') || s.includes("\n"))
      ? '"' + s.replace(/"/g, '""') + '"'
      : s;
  };
  const lines = [headers.map(esc).join(",")];
  rows.forEach(a => {
    const m   = members.find(x => x.name === a.user);
    const def = ACTS[a.actKey] || {};
    lines.push([
      a.date,
      a.user,
      ROLES[m && m.role] ? ROLES[m.role].label : "",
      a.userTeam || "",
      def.source === "jira" ? "Jira" : "App",
      def.label  || a.actKey,
      a.ticketId || "",
      a.ticketTitle || a.topic || a.prName || def.label || "",
      a.customerName || a.prName || "",
      a.startTime || "",
      a.endTime   || "",
      a.dur       || 0,
      a.status === "completed" ? "Selesai" : "In Progress",
      (a.note || "").replace(/\n/g, " "),
    ].map(esc).join(","));
  });
  const bom  = "\uFEFF";
  const blob = new Blob([bom + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = "engineer-report-" + new Date().toISOString().slice(0,10) + ".csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportPDF(rows, members, ACTS) {
  const dateStr   = new Date().toLocaleDateString("id-ID", { day:"numeric", month:"long", year:"numeric" });
  const totalMins = rows.reduce((s,a) => s + (a.dur||0), 0);
  const doneCount = rows.filter(a => a.status === "completed").length;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  let y = drawTitle(doc, 'Engineer Daily Report', `Seraphim Digital Technology | Dicetak: ${dateStr}`);
  y = drawCards(doc, [
    { label: 'Total Aktivitas', value: rows.length, color: '#4f46e5' },
    { label: 'Total Jam Kerja', value: fmtDur(totalMins), color: '#14b8a6' },
    { label: 'Selesai', value: doneCount, color: '#22c55e' },
    { label: 'In Progress', value: rows.length - doneCount, color: '#f59e0b' },
  ], y);
  y = drawSection(doc, 'Activity Detail', y);

  autoTable(doc, {
    startY: y,
    head: [['Tanggal', 'Member', 'Source', 'Kategori', 'Aktivitas / Ticket', 'Customer', 'Waktu', 'Status']],
    body: rows.map((a) => {
      const def = ACTS[a.actKey] || {};
      const title = `${a.ticketId ? `${a.ticketId} ` : ''}${a.ticketTitle || a.topic || a.prName || def.label || '-'}`;
      const time = (a.startTime && a.endTime) ? `${a.startTime}-${a.endTime}` : fmtDur(a.dur || 0);
      return [
        a.date || '-',
        a.user || '-',
        def.source === 'jira' ? 'Jira' : 'App',
        def.label || a.actKey || '-',
        title,
        a.customerName || a.prName || '-',
        time,
        a.status === 'completed' ? 'Selesai' : 'Progress',
      ];
    }),
    theme: 'grid',
    headStyles: { fillColor: [238, 242, 247], textColor: [71, 85, 105], fontStyle: 'bold' },
    styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
    margin: { left: 14, right: 14 },
    columnStyles: { 4: { cellWidth: 68 }, 5: { cellWidth: 38 } },
  });

  addFooter(doc);
  doc.save(`engineer-report-${new Date().toISOString().slice(0,10)}.pdf`);
}

const quarterRange = (year, quarter) => {
  const ranges = {
    Q1: [`${year}-01-01`, `${year}-03-31`],
    Q2: [`${year}-04-01`, `${year}-06-30`],
    Q3: [`${year}-07-01`, `${year}-09-30`],
    Q4: [`${year}-10-01`, `${year}-12-31`],
  };
  return ranges[quarter] || ranges.Q1;
};

const scoreLabel = (value) => (
  value === null || value === undefined ? 'N/A' : Number(value).toFixed(2)
);

const formatEvidenceDate = (value) => {
  const raw = cleanCell(value);
  if (!raw) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const hasTime = /T|\d{2}:\d{2}/.test(raw);
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(hasTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
};

const gradeKpi = (score) => {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return 'N/A';
  const value = Number(score);
  if (value >= 3.5) return 'Baik';
  if (value >= 2.5) return 'Cukup';
  return 'Kurang';
};

const kpiSummaryRows = (items = []) => items.map((item) => {
  const scores = item.scorecard?.scorecard?.scores || {};
  return [
    item.user?.name || item.scorecard?.user?.name || '-',
    scoreLabel(scores.impl),
    scoreLabel(scores.pm),
    scoreLabel(scores.cm),
    scoreLabel(scores.enh),
    scoreLabel(scores.ops),
    scoreLabel(item.scorecard?.scorecard?.finalScore),
    gradeKpi(item.scorecard?.scorecard?.finalScore),
    item.scorecard?.scorecard?.completedJiraTaskCount ?? 0,
    item.scorecard?.scorecard?.eligibleBonus ? 'Ya' : 'Tidak',
    item.scorecard?.scorecard?.qbMultiplier ?? 0,
  ];
});

const cleanCell = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const isJiraIssueKey = (value) => /^[A-Z][A-Z0-9]+-\d+$/i.test(cleanCell(value));

const collectQuarterlyEvidenceRows = ({ rows = [], ACTS = {}, scorecard } = {}) => {
  const breakdown = scorecard?.scorecard?.breakdown || {};
  const evidence = [];
  const seen = new Set();
  const push = ({ domain, type, issue, summary, parent, due, actual, status }) => {
    const issueKey = cleanCell(issue || parent);
    const parentRaw = cleanCell(parent);
    const parentDisplay = parentRaw && !isJiraIssueKey(parentRaw) ? 'Parent PM' : parentRaw;
    if (!issueKey) return;
    const key = `${domain}|${type}|${issueKey}|${parentDisplay}`;
    if (seen.has(key)) return;
    seen.add(key);
    evidence.push([
      domain || '-',
      type || '-',
      issueKey,
      cleanCell(summary) || '-',
      parentDisplay || '-',
      cleanCell(due) || '-',
      cleanCell(actual) || '-',
      cleanCell(status) || '-',
    ]);
  };

  (breakdown.impl?.components?.taskAccuracy?.items || []).forEach((item) => {
    push({
      domain: 'Implementation',
      type: 'Subtask [IMP]',
      issue: item.issueKey,
      summary: item.summary,
      due: item.dueDate,
      actual: item.actualEndAt,
      status: item.excusedByBlocker ? 'Blocked score 4' : item.actualEndAt ? (item.onTime ? 'On time' : 'Late') : 'Open',
    });
  });

  (breakdown.pm?.components?.execution?.items || []).forEach((item) => {
    push({
      domain: 'Preventive Maintenance',
      type: 'Pekerjaan PM',
      issue: item.issueKey,
      summary: 'Pekerjaan PM',
      parent: item.parentRef,
      due: item.dueDate,
      actual: item.actualEndAt,
      status: item.pendingWithinDueDate ? 'Pending within due date' : scoreLabel(item.score),
    });
  });

  (breakdown.pm?.components?.report?.items || []).forEach((item) => {
    push({
      domain: 'Preventive Maintenance',
      type: 'Report PM',
      issue: item.issueKey,
      summary: item.assumedByPolicy ? 'Report PM assumed by policy' : 'Report PM',
      parent: item.parentRef,
      due: item.dueDate,
      actual: item.reportActualEndAt,
      status: item.assumedByPolicy ? 'Assumed by policy' : item.pendingWithinDueDate ? 'Pending within due date' : scoreLabel(item.score),
    });
  });

  (breakdown.cm?.components?.resolution?.items || []).forEach((item) => {
    push({
      domain: 'Corrective Maintenance',
      type: 'SUP Problem',
      issue: item.issueKey,
      summary: item.priority,
      due: item.actualStartAt,
      actual: item.actualEndAt,
      status: scoreLabel(item.score),
    });
  });

  (breakdown.cm?.components?.response?.items || []).forEach((item) => {
    push({
      domain: 'Corrective Maintenance',
      type: 'SUP Problem',
      issue: item.issueKey,
      summary: item.priority,
      due: item.createdAt,
      actual: item.firstCommentAt,
      status: scoreLabel(item.score),
    });
  });

  (breakdown.enh?.components?.response?.items || []).forEach((item) => {
    push({
      domain: 'Enhancement',
      type: 'SUP Change',
      issue: item.issueKey,
      due: item.createdAt,
      actual: item.firstCommentAt,
      status: scoreLabel(item.score),
    });
  });

  (breakdown.ops?.components?.taskTree?.items || []).forEach((task) => {
    push({
      domain: 'Operational Service / MSS',
      type: 'Task [OP]',
      issue: task.taskKey,
      summary: task.taskSummary,
      due: task.dueDate,
      actual: task.resolutionDate,
      status: task.statusName,
    });
    (task.subtasks || []).forEach((subtask) => {
      push({
        domain: 'Operational Service / MSS',
        type: 'Subtask [OP]',
        issue: subtask.issueKey,
        parent: task.taskKey,
        summary: subtask.summary,
        due: subtask.dueDate,
        actual: subtask.actualEndAt || subtask.resolutionDate,
        status: subtask.statusName,
      });
    });
  });

  rows.forEach((activity) => {
    const def = ACTS[activity.actKey] || {};
    const issueKey = cleanCell(activity.ticketId);
    const normalizedIssueKey = issueKey.toUpperCase();
    if (!issueKey || (def.source !== 'jira' && !normalizedIssueKey.startsWith('SUP-'))) return;
    push({
      domain: 'Jira Activity',
      type: normalizedIssueKey.startsWith('SUP-') ? 'SUP' : 'Task/Subtask',
      issue: issueKey,
      summary: activity.ticketTitle || activity.topic || activity.prName || def.label,
      actual: activity.date,
      status: activity.status === 'completed' ? 'Selesai' : activity.status,
    });
  });

  return evidence;
};

const collectQuarterlyEvidenceSections = ({ rows = [], ACTS = {}, scorecard } = {}) => {
  const breakdown = scorecard?.scorecard?.breakdown || {};
  const sections = {
    implementation: [],
    pm: [],
    sup: [],
    ops: [],
  };
  const seen = {
    implementation: new Set(),
    pm: new Set(),
    sup: new Set(),
    ops: new Set(),
  };
  const push = (section, keyParts, row) => {
    const key = keyParts.map(cleanCell).join('|');
    if (!key || seen[section].has(key)) return;
    seen[section].add(key);
    sections[section].push(row.map((value) => cleanCell(value) || '-'));
  };

  (breakdown.impl?.components?.taskAccuracy?.items || []).forEach((item) => {
    push('implementation', [item.issueKey], [
      item.issueKey,
      item.summary,
      formatEvidenceDate(item.dueDate),
      formatEvidenceDate(item.actualEndAt),
      item.excusedByBlocker ? 'Blocked score 4' : item.actualEndAt ? (item.onTime ? 'On time' : 'Late') : 'Open',
    ]);
  });

  const pmGroups = new Map();
  const addPmItem = (item, kind) => {
    const parentRaw = cleanCell(item.parentRef || item.parentKey || item.parentIssueKey);
    const groupKey = parentRaw || item.issueKey || kind;
    const group = pmGroups.get(groupKey) || {
      parentLabel: isJiraIssueKey(parentRaw) ? parentRaw : 'Parent PM',
      parentDueDate: item.parentDueDate || item.dueDate || '-',
      items: [],
    };
    group.items.push({ ...item, kind });
    pmGroups.set(groupKey, group);
  };
  (breakdown.pm?.components?.execution?.items || []).forEach((item) => addPmItem(item, 'Pekerjaan PM'));
  (breakdown.pm?.components?.report?.items || []).forEach((item) => addPmItem(item, 'Report PM'));

  Array.from(pmGroups.values()).forEach((group, index) => {
    const parentLabel = group.parentLabel === 'Parent PM' && pmGroups.size > 1 ? `Parent PM ${index + 1}` : group.parentLabel;
    push('pm', ['parent', parentLabel, group.parentDueDate, index], [
      'Parent',
      parentLabel,
      `Due parent: ${formatEvidenceDate(group.parentDueDate)}`,
      formatEvidenceDate(group.parentDueDate),
      '-',
      '-',
    ]);
    group.items.forEach((item) => {
      const isExecution = item.kind === 'Pekerjaan PM';
      const actual = isExecution ? item.actualEndAt : item.reportActualEndAt;
      const status = item.assumedByPolicy
        ? 'Assumed by policy'
        : item.pendingWithinDueDate
          ? 'Pending within due date'
          : scoreLabel(item.score);
      push('pm', [parentLabel, item.kind, item.issueKey || 'policy'], [
        'Child',
        item.issueKey ? `  ${item.issueKey}` : '  Report PM',
        item.kind,
        formatEvidenceDate(item.dueDate),
        formatEvidenceDate(actual),
        status,
      ]);
    });
  });

  const supActivityKeys = new Set(
    rows
      .map((activity) => cleanCell(activity.ticketId))
      .filter((issueKey) => issueKey.toUpperCase().startsWith('SUP-'))
      .map((issueKey) => issueKey.toUpperCase())
  );
  const supByIssue = new Map();
  const recordSup = (issueKey, patch) => {
    const normalizedIssueKey = cleanCell(issueKey).toUpperCase();
    if (!normalizedIssueKey.startsWith('SUP-')) return;
    if (supActivityKeys.size && !supActivityKeys.has(normalizedIssueKey)) return;
    const current = supByIssue.get(normalizedIssueKey) || {
      issue: cleanCell(issueKey),
      type: '',
      topic: '',
      start: '',
      end: '',
      status: '',
    };
    const next = { ...current };
    if (patch.type && !next.type) next.type = patch.type;
    if (patch.topic && patch.topic !== '-' && (!next.topic || patch.preferTopic)) next.topic = patch.topic;
    if (patch.start && !next.start) next.start = patch.start;
    if (patch.end) next.end = patch.end;
    if (patch.status && patch.status !== 'N/A') next.status = patch.status;
    supByIssue.set(normalizedIssueKey, next);
  };

  (breakdown.cm?.components?.response?.items || []).forEach((item) => {
    recordSup(item.issueKey, {
      type: 'Problem',
      topic: item.summary || item.priority,
      start: item.createdAt,
      end: item.firstCommentAt,
      status: `Response ${scoreLabel(item.score)}`,
    });
  });
  (breakdown.cm?.components?.resolution?.items || []).forEach((item) => {
    recordSup(item.issueKey, {
      type: 'Problem',
      topic: item.summary || item.priority,
      start: item.actualStartAt,
      end: item.actualEndAt,
      status: `Resolution ${scoreLabel(item.score)}`,
    });
  });
  (breakdown.enh?.components?.response?.items || []).forEach((item) => {
    recordSup(item.issueKey, {
      type: 'Change',
      topic: item.summary,
      start: item.createdAt,
      end: item.firstCommentAt,
      status: `Response ${scoreLabel(item.score)}`,
    });
  });

  rows.forEach((activity) => {
    const issueKey = cleanCell(activity.ticketId);
    if (!issueKey.toUpperCase().startsWith('SUP-')) return;
    recordSup(issueKey, {
      type: 'SUP Activity',
      topic: activity.ticketTitle || activity.topic || activity.prName || ACTS[activity.actKey]?.label,
      preferTopic: true,
      start: activity.date,
      end: activity.date,
      status: activity.status === 'completed' ? 'Selesai' : activity.status,
    });
  });

  Array.from(supByIssue.values())
    .sort((left, right) => left.issue.localeCompare(right.issue, undefined, { numeric: true }))
    .forEach((item) => {
      push('sup', ['sup', item.issue], [
        item.issue,
        item.type || 'SUP',
        item.topic || '-',
        formatEvidenceDate(item.start),
        formatEvidenceDate(item.end),
        item.status || '-',
      ]);
    });

  (breakdown.ops?.components?.taskTree?.items || []).forEach((task) => {
    push('ops', ['task', task.taskKey], [
      'Task',
      task.taskKey,
      task.taskSummary,
      formatEvidenceDate(task.dueDate),
      formatEvidenceDate(task.resolutionDate),
      task.statusName,
    ]);
    (task.subtasks || []).forEach((subtask) => {
      push('ops', ['subtask', task.taskKey, subtask.issueKey], [
        'Subtask',
        `  ${subtask.issueKey}`,
        subtask.summary,
        formatEvidenceDate(subtask.dueDate),
        formatEvidenceDate(subtask.actualEndAt || subtask.resolutionDate),
        subtask.statusName,
      ]);
    });
  });

  return sections;
};

const drawEvidenceTable = (doc, y, title, head, body, columnStyles = {}) => {
  if (!body.length) return y;
  y = drawSection(doc, title, y);
  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    theme: 'grid',
    headStyles: { fillColor: [238, 242, 247], textColor: [71, 85, 105], fontStyle: 'bold' },
    styles: { fontSize: 7, cellPadding: 1.4, overflow: 'linebreak' },
    margin: { left: 14, right: 14 },
    columnStyles,
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const firstValue = String(data.row.raw?.[0] || '');
      if (firstValue === 'Parent' || firstValue === 'Task') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [248, 250, 252];
      }
    },
  });
  return (doc.lastAutoTable?.finalY || y) + 8;
};

export function exportKpiSummaryCSV({ items, year, quarter }) {
  const esc = v => {
    const s = String(v == null ? "" : v);
    return (s.includes(",") || s.includes('"') || s.includes("\n")) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const headers = ['Nama','KPI Implementasi','KPI PM','KPI CM','KPI Enhancement','KPI Operational','Score Akhir','Kategori','Jumlah Act','Eligible QB?','Besar QB'];
  const engineerRows = kpiSummaryRows(items.filter((item) => item.group === 'engineer'));
  const pmRows = kpiSummaryRows(items.filter((item) => item.group === 'pm'));
  const lines = [
    [`KPI Summary Report`, `${quarter} ${year}`].map(esc).join(','),
    '',
    ['Ringkasan KPI Engineer'].map(esc).join(','),
    headers.map(esc).join(','),
    ...engineerRows.map((row) => row.map(esc).join(',')),
    '',
    ['Ringkasan KPI Project Manager'].map(esc).join(','),
    headers.map(esc).join(','),
    ...pmRows.map((row) => row.map(esc).join(',')),
  ];

  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `kpi-summary-${quarter}-${year}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportKpiSummaryPDF({ items, year, quarter }) {
  const engineerItems = items.filter((item) => item.group === 'engineer');
  const pmItems = items.filter((item) => item.group === 'pm');
  const totalJiraTasks = items.reduce((sum, item) => sum + Number(item.scorecard?.scorecard?.completedJiraTaskCount || 0), 0);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  let y = drawTitle(doc, 'KPI Summary Report', `Periode ${quarter} ${year}`);

  y = drawCards(doc, [
    { label: 'Total Engineer', value: engineerItems.length, color: '#4f46e5' },
    { label: 'Total Project Manager', value: pmItems.length, color: '#14b8a6' },
    { label: 'Total Jira Task', value: totalJiraTasks, color: '#f59e0b' },
  ], y);

  const headers = [['Nama','KPI Impl','KPI PM','KPI CM','KPI Enh','KPI Ops','Score','Kategori','Jml Act','QB?','Besar QB']];
  y = drawSection(doc, 'Ringkasan KPI Engineer', y);
  autoTable(doc, {
    startY: y,
    head: headers,
    body: kpiSummaryRows(engineerItems),
    theme: 'grid',
    headStyles: { fillColor: [238, 242, 247], textColor: [71, 85, 105], fontStyle: 'bold' },
    styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
    margin: { left: 14, right: 14 },
    columnStyles: { 0: { cellWidth: 42 } },
  });
  y = (doc.lastAutoTable?.finalY || y) + 10;

  y = drawSection(doc, 'Ringkasan KPI Project Manager', y);
  autoTable(doc, {
    startY: y,
    head: headers,
    body: kpiSummaryRows(pmItems),
    theme: 'grid',
    headStyles: { fillColor: [238, 242, 247], textColor: [71, 85, 105], fontStyle: 'bold' },
    styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
    margin: { left: 14, right: 14 },
    columnStyles: { 0: { cellWidth: 42 } },
  });

  addFooter(doc);
  doc.save(`kpi-summary-${quarter}-${year}.pdf`);
}

export function exportQuarterlyKpiCSV({ rows, ACTS, scorecard, user, year, quarter }) {
  const [start, end] = quarterRange(year, quarter);
  const totalMins = rows.reduce((sum, row) => sum + (row.dur || 0), 0);
  const esc = v => {
    const s = String(v == null ? "" : v);
    return (s.includes(",") || s.includes('"') || s.includes("\n")) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [
    [`Individual Performance Dossier`, `${quarter} ${year}`, `${start} - ${end}`].map(esc).join(","),
    ["Nama", user?.name || scorecard?.user?.name || ""].map(esc).join(","),
    ["Role", ROLES[user?.role || scorecard?.user?.role]?.label || user?.role || scorecard?.user?.role || ""].map(esc).join(","),
    ["Total Activity", rows.length].map(esc).join(","),
    ["Manhour", totalMins].map(esc).join(","),
    "",
    ["KPI Scorecard"].map(esc).join(","),
    ["Profile", "Final Score", "QB Multiplier", "Jira Done", "Eligible Bonus", "Domain", "Domain Score", "Domain Note"].map(esc).join(","),
  ];

  const domains = scorecard?.profile?.domains || [];
  domains.forEach((domain) => {
    lines.push([
      scorecard?.profile?.label || "",
      scoreLabel(scorecard?.scorecard?.finalScore),
      scorecard?.scorecard?.qbMultiplier || 0,
      scorecard?.scorecard?.completedJiraTaskCount || 0,
      scorecard?.scorecard?.eligibleBonus ? "Ya" : "Tidak",
      domain.label,
      scoreLabel(scorecard?.scorecard?.scores?.[domain.key]),
      scorecard?.scorecard?.notes?.[domain.key] || "",
    ].map(esc).join(","));
  });

  const evidenceRows = collectQuarterlyEvidenceRows({ rows, ACTS, scorecard });
  lines.push("");
  lines.push(["Assigned Jira Tasks / SUP Evidence"].map(esc).join(","));
  lines.push(["Domain","Type","Issue","Summary","Parent","Due / Created","Actual / Done","Status"].map(esc).join(","));
  if (evidenceRows.length) {
    evidenceRows.forEach((row) => lines.push(row.map(esc).join(",")));
  } else {
    lines.push(["-","-","Tidak ada evidence Jira","-","-","-","-","-"].map(esc).join(","));
  }

  lines.push("");
  lines.push(["Activities"].map(esc).join(","));
  lines.push(["Tanggal","Member","Source","Kategori","Ticket ID","Judul / Topik","Customer","Durasi (mnt)","Status","Catatan"].map(esc).join(","));
  rows.forEach((a) => {
    const def = ACTS[a.actKey] || {};
    lines.push([
      a.date,
      a.user,
      def.source === "jira" ? "Jira" : "App",
      def.label || a.actKey,
      a.ticketId || "",
      a.ticketTitle || a.topic || a.prName || "",
      a.customerName || a.prName || "",
      a.dur || 0,
      a.status || "",
      (a.note || "").replace(/\n/g, " "),
    ].map(esc).join(","));
  });

  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `individual-performance-${user?.name || scorecard?.user?.name || 'member'}-${quarter}-${year}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportQuarterlyKpiPDF({ rows, ACTS, scorecard, user, year, quarter }) {
  const [start, end] = quarterRange(year, quarter);
  const totalMins = rows.reduce((sum, row) => sum + (row.dur || 0), 0);
  const reportUser = user || scorecard?.user || {};
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = drawTitle(doc, 'Individual Performance Dossier', `Periode ${quarter} ${year} | ${start} sampai ${end}`);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(219, 226, 239);
  doc.roundedRect(14, y, 182, 22, 3, 3, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(reportUser.name || '-', 19, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`${ROLES[reportUser.role]?.label || reportUser.role || '-'} | ${reportUser.email || scorecard?.user?.email || ''}`, 19, y + 15);
  y += 30;

  y = drawCards(doc, [
    { label: 'Total Activity', value: rows.length, color: '#4f46e5' },
    { label: 'Manhour', value: fmtDur(totalMins), color: '#14b8a6' },
    { label: 'Final KPI', value: scoreLabel(scorecard?.scorecard?.finalScore), color: '#22c55e' },
  ], y);

  y = drawSection(doc, 'KPI Scorecard', y);
  autoTable(doc, {
    startY: y,
    head: [['Profile', 'Final Score', 'QB', 'Jira Done', 'Bonus']],
    body: [[
      scorecard?.profile?.label || 'KPI Scorecard',
      scoreLabel(scorecard?.scorecard?.finalScore),
      scorecard?.scorecard?.qbMultiplier || 0,
      scorecard?.scorecard?.completedJiraTaskCount || 0,
      scorecard?.scorecard?.eligibleBonus ? 'Eligible' : 'Tidak',
    ]],
    theme: 'grid',
    headStyles: { fillColor: [238, 242, 247], textColor: [71, 85, 105], fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 1.8 },
    margin: { left: 14, right: 14 },
  });
  y = (doc.lastAutoTable?.finalY || y) + 6;

  autoTable(doc, {
    startY: y,
    head: [['Domain', 'Score', 'Catatan']],
    body: (scorecard?.profile?.domains || []).map((domain) => [
      domain.label,
      scoreLabel(scorecard?.scorecard?.scores?.[domain.key]),
      scorecard?.scorecard?.notes?.[domain.key] || '-',
    ]),
    theme: 'grid',
    headStyles: { fillColor: [238, 242, 247], textColor: [71, 85, 105], fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 1.8, overflow: 'linebreak' },
    margin: { left: 14, right: 14 },
    columnStyles: { 2: { cellWidth: 100 } },
  });
  y = (doc.lastAutoTable?.finalY || y) + 10;

  y = drawSection(doc, 'Assigned Jira Tasks / SUP Evidence', y);
  const evidenceSections = collectQuarterlyEvidenceSections({ rows, ACTS, scorecard });
  const hasEvidence = Object.values(evidenceSections).some((sectionRows) => sectionRows.length > 0);
  if (!hasEvidence) {
    autoTable(doc, {
      startY: y,
      head: [['Info']],
      body: [['Tidak ada evidence Jira pada periode ini.']],
      theme: 'grid',
      headStyles: { fillColor: [238, 242, 247], textColor: [71, 85, 105], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 1.8 },
      margin: { left: 14, right: 14 },
    });
    y = (doc.lastAutoTable?.finalY || y) + 10;
  } else {
    y = drawEvidenceTable(doc, y, 'Implementation', ['Issue', 'Summary', 'Due Date', 'Actual End', 'Status'], evidenceSections.implementation, {
      0: { cellWidth: 25 },
      1: { cellWidth: 75 },
      2: { cellWidth: 27 },
      3: { cellWidth: 27 },
      4: { cellWidth: 28 },
    });
    y = drawEvidenceTable(doc, y, 'Preventive Maintenance', ['Level', 'Issue', 'Summary', 'Due Date', 'Actual End', 'Status'], evidenceSections.pm, {
      0: { cellWidth: 18 },
      1: { cellWidth: 30 },
      2: { cellWidth: 58 },
      3: { cellWidth: 26 },
      4: { cellWidth: 26 },
      5: { cellWidth: 24 },
    });
    y = drawEvidenceTable(doc, y, 'SUP Problem / Change', ['Issue', 'Type', 'Topic / Priority', 'Start / Created', 'End / Response', 'Status'], evidenceSections.sup, {
      0: { cellWidth: 25 },
      1: { cellWidth: 31 },
      2: { cellWidth: 58 },
      3: { cellWidth: 27 },
      4: { cellWidth: 27 },
      5: { cellWidth: 14 },
    });
    y = drawEvidenceTable(doc, y, 'Operational Service / MSS', ['Level', 'Issue', 'Summary', 'Due Date', 'Actual End', 'Status'], evidenceSections.ops, {
      0: { cellWidth: 18 },
      1: { cellWidth: 30 },
      2: { cellWidth: 70 },
      3: { cellWidth: 24 },
      4: { cellWidth: 24 },
      5: { cellWidth: 16 },
    });
    y += 2;
  }

  y = drawSection(doc, 'Activity Detail', y);
  autoTable(doc, {
    startY: y,
    head: [['Tanggal', 'Member', 'Source', 'Kategori', 'Aktivitas / Ticket', 'Durasi', 'Status']],
    body: rows.map((a) => {
      const def = ACTS[a.actKey] || {};
      return [
        a.date || '-',
        a.user || '-',
        def.source === 'jira' ? 'Jira' : 'App',
        def.label || a.actKey || '-',
        `${a.ticketId ? `${a.ticketId} ` : ''}${a.ticketTitle || a.topic || a.prName || ''}`,
        fmtDur(a.dur),
        a.status || '-',
      ];
    }),
    theme: 'grid',
    headStyles: { fillColor: [238, 242, 247], textColor: [71, 85, 105], fontStyle: 'bold' },
    styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
    margin: { left: 14, right: 14 },
    columnStyles: { 4: { cellWidth: 58 } },
  });

  addFooter(doc);
  doc.save(`individual-performance-${safeName(reportUser.name || 'member')}-${quarter}-${year}.pdf`);
}
