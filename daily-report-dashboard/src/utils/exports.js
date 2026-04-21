import { ROLES } from '../constants/taxonomy';

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
  const fmtDur    = m => { const h = Math.floor(m/60), mn = m%60; return h ? h+"j "+mn+"m" : mn+"m"; };
  const totalMins = rows.reduce((s,a) => s + (a.dur||0), 0);
  const doneCount = rows.filter(a => a.status === "completed").length;

  const rowsHtml = rows.map((a, i) => {
    const def    = ACTS[a.actKey] || {};
    const title  = a.ticketTitle || a.topic || a.prName || def.label || "—";
    const time   = (a.startTime && a.endTime) ? a.startTime+"–"+a.endTime : fmtDur(a.dur||0);
    const badge  = a.ticketId
      ? "<code style=\"background:#0D1F3C;color:#2684FF;padding:1px 5px;border-radius:3px;font-size:10px\">"
        + a.ticketId + "</code> "
      : "";
    const srcDot = def.source === "jira"
      ? "<span style=\"color:#2684FF;margin-right:3px\">◈</span>"
      : "";
    const statusColor = a.status === "completed" ? "#34D399" : "#F59E0B";
    const statusLabel = a.status === "completed" ? "✓ Selesai" : "⏳ Progress";
    const bg = i % 2 === 0 ? "#1a1f2e" : "#14181f";
    return "<tr style=\"background:"+bg+"\">"
      + "<td>"+a.date+"</td>"
      + "<td>"+a.user+"</td>"
      + "<td>"+srcDot+(def.label||a.actKey)+"</td>"
      + "<td>"+badge+title+"</td>"
      + "<td>"+(a.customerName||a.prName||"—")+"</td>"
      + "<td style=\"font-family:monospace;white-space:nowrap\">"+time+"</td>"
      + "<td style=\"color:"+statusColor+"\">"+statusLabel+"</td>"
      + "</tr>";
  }).join("");

  const css = [
    "*{margin:0;padding:0;box-sizing:border-box}",
    "body{font-family:'Segoe UI',Arial,sans-serif;background:#0f1117;color:#f0f4ff;padding:32px;font-size:12px}",
    "h1{font-size:22px;font-weight:800;color:#818CF8;margin-bottom:4px}",
    ".sub{color:#4A5568;font-size:11px;margin-bottom:24px}",
    ".stats{display:flex;gap:16px;margin-bottom:24px}",
    ".stat{background:#171923;border:1px solid #252B3B;border-radius:8px;padding:12px 18px;flex:1}",
    ".sv{font-size:20px;font-weight:800;color:#6366F1;font-family:monospace}",
    ".sl{font-size:10px;color:#4A5568;text-transform:uppercase;letter-spacing:.06em;margin-top:2px}",
    "table{width:100%;border-collapse:collapse}",
    "th{background:#1E2333;color:#8892AA;font-size:10px;text-transform:uppercase;letter-spacing:.05em;padding:8px 10px;text-align:left;border-bottom:1px solid #252B3B}",
    "td{padding:7px 10px;color:#c8d0e0;border-bottom:1px solid #1a1f2e;font-size:11px}",
    "@media print{",
      "body{background:#fff;color:#111}",
      "h1{color:#4338CA}",
      "th{background:#eee;color:#333}",
      "td{color:#222;border-color:#ddd}",
      "tr{background:#fff!important}",
      ".stat{background:#f4f4f8;border-color:#ddd}",
      ".sv{color:#4338CA}",
      ".sl{color:#888}",
    "}",
  ].join("");

  const html = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Engineer Daily Report</title>"
    + "<style>"+css+"</style></head><body>"
    + "<h1>&#128203; Engineer Daily Report</h1>"
    + "<div class=\"sub\">Seraphim Digital Technology &nbsp;&middot;&nbsp; Dicetak: "+dateStr+"</div>"
    + "<div class=\"stats\">"
    +   "<div class=\"stat\"><div class=\"sv\">"+rows.length+"</div><div class=\"sl\">Total Aktivitas</div></div>"
    +   "<div class=\"stat\"><div class=\"sv\">"+fmtDur(totalMins)+"</div><div class=\"sl\">Total Jam Kerja</div></div>"
    +   "<div class=\"stat\"><div class=\"sv\">"+doneCount+"</div><div class=\"sl\">Selesai</div></div>"
    +   "<div class=\"stat\"><div class=\"sv\">"+(rows.length-doneCount)+"</div><div class=\"sl\">In Progress</div></div>"
    + "</div>"
    + "<table><thead><tr>"
    +   "<th>Tanggal</th><th>Member</th><th>Kategori</th>"
    +   "<th>Aktivitas / Ticket</th><th>Customer</th><th>Waktu</th><th>Status</th>"
    + "</tr></thead><tbody>"+rowsHtml+"</tbody></table>"
    + "<div style=\"margin-top:20px;font-size:10px;color:#4A5568;text-align:center\">"
    +   "Generated by EngineerLog &copy; Seraphim Digital Technology"
    + "</div></body></html>";

  const win = window.open("", "_blank", "width=1060,height=750");
  if (!win) { alert("Pop-up diblokir browser. Izinkan pop-up untuk export PDF."); return; }
  win.document.write(html);
  win.document.close();
  win.onload = function() { win.focus(); win.print(); };
}
