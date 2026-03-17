export const INIT_MEMBERS = [
  // ── Delivery ──
  { id:10, name:"Budi Santoso",  email:"staff@seraphim.id",  password:"staff123", role:"service_engineer", avatar:"BS", team:"delivery", position:"Senior Service Engineer", dept:"Delivery",  status:"active",    joinDate:"2023-01-15", supervisorId:12 },
  { id:11, name:"Dewi Rahayu",   email:"dewi@seraphim.id",  password:"Dewi123!",   role:"delivery", avatar:"DR", team:"delivery", position:"Service Engineer",        dept:"Delivery",  status:"active",    joinDate:"2023-03-10", supervisorId:12 },
  { id:12, name:"Rizky Pratama", email:"rizky@seraphim.id", password:"Rizky123!",  role:"mgr_dl",   avatar:"RP", team:"delivery", position:"Delivery Manager",        dept:"Delivery",  status:"active",    joinDate:"2022-06-01", supervisorId:null },
  { id:13, name:"Sari Indah",    email:"sari@seraphim.id",  password:"Sari123!",   role:"delivery", avatar:"SI", team:"delivery", position:"Junior Service Engineer",  dept:"Delivery",  status:"suspended", joinDate:"2023-07-20", supervisorId:12 },
  { id:14, name:"Doni Prasetyo", email:"doni@seraphim.id",  password:"PM123!",     role:"pm",       avatar:"DP", team:"delivery", position:"Project Manager",         dept:"Delivery",  status:"active",    joinDate:"2022-04-18", supervisorId:12 },
  // ── Pre-Sales ──
  { id:15, name:"Ahmad Yusuf",   email:"ahmad@seraphim.id", password:"Ahmad123!",  role:"presales", avatar:"AY", team:"presales", position:"Sales Engineer",          dept:"Pre-Sales", status:"active",    joinDate:"2023-02-14", supervisorId:20 },
  { id:16, name:"Nina Kartika",  email:"nina@seraphim.id",  password:"PS123!",     role:"presales", avatar:"NK", team:"presales", position:"Senior Sales Engineer",   dept:"Pre-Sales", status:"active",    joinDate:"2022-11-05", supervisorId:20 },
  { id:17, name:"Lena Susanti",  email:"lena@seraphim.id",  password:"Lena123!",   role:"presales", avatar:"LS", team:"presales", position:"Sales Engineer",          dept:"Pre-Sales", status:"invited",   joinDate:"2024-01-08", supervisorId:20 },
  // ── Pre-Sales Manager (new) ──
  { id:20, name:"Hendra Wijaya", email:"hendra@seraphim.id",password:"Mgr123!",    role:"mgr_ps",   avatar:"HW", team:"presales", position:"Pre-Sales Manager",       dept:"Pre-Sales", status:"active",    joinDate:"2021-03-01", supervisorId:null },
  // ── Admin ──
  { id:99, name:"Super Admin",   email:"admin@seraphim.id", password:"admin123",  role:"admin",    avatar:"AW", team:"all",      position:"System Administrator",    dept:"IT",        status:"active",    joinDate:"2021-01-01", supervisorId:null },
];

export const DEMO_ACCOUNTS = INIT_MEMBERS.filter(m =>
  ["admin@seraphim.id","staff@seraphim.id","doni@seraphim.id","nina@seraphim.id","rizky@seraphim.id"].includes(m.email)
);

export const INIT_ACTS = [
  // ─── Budi Santoso (Service Engineer) ───
  { id:1,  user:"Budi Santoso", userTeam:"delivery", actKey:"jira_impl", date:"2026-03-10", dur:210, status:"completed",
    ticketId:"PROJ-101", ticketTitle:"API Integration Gateway Pembayaran", customerName:"PT. Tokobagus", note:"Selesai endpoint /payment/confirm",
    kpi:{ taskPct:100, docsLate:1, critMissing:false, nps:4 } },
  { id:2,  user:"Budi Santoso", userTeam:"delivery", actKey:"jira_pm",   date:"2026-03-05", dur:240, status:"completed",
    ticketId:"MAINT-001", ticketTitle:"PM Firewall Q1 – PT. Tokobagus", customerName:"PT. Tokobagus", note:"Selesai tepat waktu",
    kpi:{ scheduledEnd:"2026-03-07", actualDate:"2026-03-05", reportDays:2 } },
  { id:3,  user:"Budi Santoso", userTeam:"delivery", actKey:"jira_cm",   date:"2026-03-08", dur:120, status:"completed",
    ticketId:"CM-042", ticketTitle:"Auth Service Down – PT. Tokobagus", customerName:"PT. Tokobagus", note:"Root cause: expired cert",
    kpi:{ severity:1, responseMin:10, resolutionHours:5 } },
  { id:4,  user:"Budi Santoso", userTeam:"delivery", actKey:"learning",  date:"2026-03-09", dur:90,  status:"completed",
    topic:"CISSP Module 4 – Identity & Access Management", note:"Sudah sampai bab 12" },
  { id:5,  user:"Budi Santoso", userTeam:"delivery", actKey:"internal",  date:"2026-03-07", dur:60,  status:"completed",
    topic:"Briefing Sprint 14 – Tim Delivery", note:"Review backlog + capacity planning" },

  // ─── Dewi Rahayu (Service Engineer) ───
  { id:6,  user:"Dewi Rahayu",  userTeam:"delivery", actKey:"jira_impl", date:"2026-03-10", dur:240, status:"in_progress",
    ticketId:"PROJ-102", ticketTitle:"SIEM Integration Phase 1 – PT. BRI", customerName:"PT. BRI", note:"Masih di config agent",
    kpi:{ taskPct:75, docsLate:2, critMissing:false, nps:3 } },
  { id:7,  user:"Dewi Rahayu",  userTeam:"delivery", actKey:"jira_cm",   date:"2026-03-07", dur:60,  status:"completed",
    ticketId:"CM-043", ticketTitle:"SIEM Agent Disconnect – PT. BRI", customerName:"PT. BRI", note:"",
    kpi:{ severity:2, responseMin:12, resolutionHours:8 } },
  { id:8,  user:"Dewi Rahayu",  userTeam:"delivery", actKey:"koordinasi",date:"2026-03-06", dur:90,  status:"completed",
    topic:"Koordinasi kick-off SIEM Phase 2", contact:"PT. BRI – Pak Hendro IT", note:"Bahas scope & jadwal" },
  { id:9,  user:"Dewi Rahayu",  userTeam:"delivery", actKey:"learning",  date:"2026-03-04", dur:120, status:"completed",
    topic:"Webinar: Elastic Stack 8.x Advanced", note:"Fokus ML anomaly detection" },

  // ─── Doni Prasetyo (Project Manager) ───
  { id:10, user:"Doni Prasetyo",userTeam:"delivery", actKey:"jira_impl", date:"2026-03-10", dur:480, status:"completed",
    ticketId:"PROJ-101", ticketTitle:"[PM] E-Commerce v2 – Manage & Close", customerName:"PT. Tokobagus", note:"Milestone 3 done",
    kpi:{ cdPlan:60, cdActual:72, mdPlan:120, mdActual:130, docsLate:1, critMissing:false, nps:4 } },
  { id:11, user:"Doni Prasetyo",userTeam:"delivery", actKey:"jira_pm",   date:"2026-03-06", dur:120, status:"completed",
    ticketId:"MAINT-001", ticketTitle:"[PM] Koordinasi PM Q1 PT. Tokobagus", customerName:"PT. Tokobagus", note:"BAST PM sudah ditandatangani",
    kpi:{ bastDeadline:"2026-03-10", bastActual:"2026-03-06" } },
  { id:111,user:"Doni Prasetyo",userTeam:"delivery", actKey:"jira_ops",  date:"2026-03-11", dur:60,  status:"completed",
    ticketId:"OPS-GOV-001", ticketTitle:"Governance Ops – PT. Tokobagus – Maret 2026", customerName:"PT. Tokobagus", note:"Governance issue ditutup tepat waktu",
    kpi:{ govLateDays:0 } },
  { id:12, user:"Doni Prasetyo",userTeam:"delivery", actKey:"internal",  date:"2026-03-09", dur:90,  status:"completed",
    topic:"Steering Committee Meeting – Q1 Review", note:"Presentasi progress 3 project aktif" },

  // ─── Nina Kartika (Pre-Sales) ───
  { id:13, user:"Nina Kartika", userTeam:"presales", actKey:"demo",       date:"2026-03-10", dur:120, status:"completed",
    prName:"PT. Kalbe Farma", prId:"LEAD-185", value:1200000000, stage:"Demo Done", note:"Demo HRMS berjalan lancar, interested" },
  { id:14, user:"Nina Kartika", userTeam:"presales", actKey:"negotiation",date:"2026-03-08", dur:120, status:"completed",
    prName:"PT. Mayora Indah", prId:"LEAD-176", value:980000000,  stage:"Negotiation", note:"Nego harga lisensi annual" },
  { id:15, user:"Nina Kartika", userTeam:"presales", actKey:"ps_learning",date:"2026-03-06", dur:90,  status:"completed",
    topic:"Sales Methodology: MEDDIC Framework", note:"Training internal dari Pak Rizky" },

  // ─── Ahmad Yusuf (Pre-Sales) ───
  { id:16, user:"Ahmad Yusuf",  userTeam:"presales", actKey:"prospecting",date:"2026-03-10", dur:90,  status:"completed",
    prName:"PT. Indomaret Digital", prId:"LEAD-201", value:850000000, stage:"Contacted", note:"Cold outreach via LinkedIn + email" },
  { id:17, user:"Ahmad Yusuf",  userTeam:"presales", actKey:"proposal",   date:"2026-03-09", dur:240, status:"in_progress",
    prName:"PT. Sido Muncul", prId:"LEAD-198", value:2400000000, stage:"Proposal", note:"Draft SOW section 3-5" },
  { id:18, user:"Ahmad Yusuf",  userTeam:"presales", actKey:"survey",     date:"2026-03-07", dur:180, status:"completed",
    prName:"PT. Wings Group", prId:"LEAD-210", value:3100000000, stage:"Survey", note:"Site survey gudang Cibitung – 3 lokasi" },
];

export const WEEKLY = {
  delivery: [
    { d:"Sen", jira_impl:8,  jira_pm:2, jira_cm:3, jira_enh:2, jira_ops:3, learning:1, internal:2, koordinasi:1 },
    { d:"Sel", jira_impl:12, jira_pm:3, jira_cm:2, jira_enh:4, jira_ops:2, learning:2, internal:1, koordinasi:2 },
    { d:"Rab", jira_impl:10, jira_pm:1, jira_cm:4, jira_enh:3, jira_ops:2, learning:1, internal:3, koordinasi:1 },
    { d:"Kam", jira_impl:9,  jira_pm:2, jira_cm:1, jira_enh:5, jira_ops:3, learning:2, internal:2, koordinasi:0 },
    { d:"Jum", jira_impl:11, jira_pm:2, jira_cm:2, jira_enh:3, jira_ops:4, learning:1, internal:1, koordinasi:2 },
  ],
  presales: [
    { d:"Sen", prospecting:5, demo:2, proposal:3, negotiation:1, survey:1, ps_learning:1, ps_internal:2 },
    { d:"Sel", prospecting:8, demo:3, proposal:4, negotiation:2, survey:2, ps_learning:2, ps_internal:1 },
    { d:"Rab", prospecting:4, demo:4, proposal:2, negotiation:3, survey:1, ps_learning:1, ps_internal:2 },
    { d:"Kam", prospecting:6, demo:5, proposal:5, negotiation:2, survey:3, ps_learning:0, ps_internal:1 },
    { d:"Jum", prospecting:7, demo:3, proposal:3, negotiation:4, survey:2, ps_learning:2, ps_internal:1 },
  ],
};

export const PIPELINE=[
  {m:"Jan",contacted:12,demo:8,proposal:5,negotiation:3,won:2},
  {m:"Feb",contacted:15,demo:10,proposal:7,negotiation:4,won:3},
  {m:"Mar",contacted:18,demo:13,proposal:8,negotiation:5,won:4},
];
