import { T } from '../theme/tokens';

export const ACTS = {
  // ── DELIVERY ──
  jira_impl: {
    label: "Implementation",   icon: "🗂",  color: T.teal,  colorLo: T.tealLo,
    team: "delivery", source: "jira", kpiDomain: "impl",
    desc: "Project task dari Jira (PROJ-xxx)",
  },
  jira_pm: {
    label: "Preventive Maint.",icon: "🔧", color: T.amber, colorLo: T.amberLo,
    team: "delivery", source: "jira", kpiDomain: "pm",
    desc: "PM ticket dari Jira (MAINT-xxx)",
  },
  jira_cm: {
    label: "Corrective Maint.",icon: "🚨", color: T.red,   colorLo: T.redLo,
    team: "delivery", source: "jira", kpiDomain: "cm",
    desc: "Incident/CM ticket dari Jira (CM-xxx / SUP-xxx)",
  },
  jira_enh: {
    label: "Enhancement",      icon: "⚡", color: T.indigo, colorLo: T.indigoLo,
    team: "delivery", source: "jira", kpiDomain: "enh",
    desc: "Enhancement request dari Jira",
  },
  jira_ops: {
    label: "Operational Svc",  icon: "⚙️", color: T.violet, colorLo: T.violetLo,
    team: "delivery", source: "jira", kpiDomain: "ops",
    desc: "Ops/KB4 task dari Jira",
  },
  pm_presentation: {
    label: "Q PM Presentation", icon: "📊", color: "#F472B6", colorLo: "#2A0F1E",
    team: "delivery", source: "app", kpiDomain: "pm",
    desc: "Presentasi Quarterly PM ke Customer — wajib input Nama Customer dan Skor NPS (0–4)",
  },
  learning: {
    label: "Learning & Dev",   icon: "📚", color: "#22D3EE", colorLo: "#0C2230",
    team: "delivery", source: "app",
    desc: "Belajar mandiri, baca artikel, ikut training, sertifikasi",
  },
  internal: {
    label: "Internal Meeting", icon: "💬", color: "#94A3B8", colorLo: "#1A1F2E",
    team: "delivery", source: "app",
    desc: "Rapat internal, briefing tim, koordinasi non-klien",
  },
  koordinasi: {
    label: "Koordinasi Klien", icon: "🤝", color: "#FB923C", colorLo: "#2A1800",
    team: "delivery", source: "app",
    desc: "Koordinasi dengan klien di luar Jira ticket aktif",
  },
  // ── PRE-SALES ──
  prospecting: {
    label: "Prospecting",      icon: "🔍", color: T.violet, colorLo: T.violetLo,
    team: "presales", source: "app",
  },
  demo: {
    label: "Demo & Presentasi",icon: "🎯", color: "#C084FC", colorLo: "#1E1030",
    team: "presales", source: "app",
  },
  proposal: {
    label: "Proposal / SOW",   icon: "📋", color: "#E879F9", colorLo: "#2A0F30",
    team: "presales", source: "app",
  },
  negotiation: {
    label: "Negosiasi",        icon: "🤝", color: T.teal,   colorLo: T.tealLo,
    team: "presales", source: "app",
  },
  survey: {
    label: "Site Survey",      icon: "📐", color: T.amber,  colorLo: T.amberLo,
    team: "presales", source: "app",
  },
  ps_learning: {
    label: "Learning & Dev",   icon: "📚", color: "#22D3EE", colorLo: "#0C2230",
    team: "presales", source: "app",
  },
  ps_internal: {
    label: "Internal Meeting", icon: "💬", color: "#94A3B8", colorLo: "#1A1F2E",
    team: "presales", source: "app",
  },
};

export const PS_STAGES = ["Contacted","Demo Scheduled","Demo Done","Proposal Sent","Negotiation","Won","Lost"];

export const ROLES = {
  admin:   { label:"Admin",             color:T.red,    lo:T.redLo,    team:"all"      },
  mgr_ps:  { label:"Mgr Pre-Sales",     color:T.violet, lo:T.violetLo, team:"presales" },
  mgr_dl:  { label:"Mgr Delivery",      color:T.teal,   lo:T.tealLo,   team:"delivery" },
  pm:      { label:"Project Manager",   color:T.amber,  lo:T.amberLo,  team:"delivery" },
  presales:{ label:"Sales Engineer",    color:T.violet, lo:T.violetLo, team:"presales" },
  delivery:{ label:"Service Engineer",  color:T.teal,   lo:T.tealLo,   team:"delivery" },
};

export const teamOf  = r => ROLES[r]?.team || "all";
export const isAdmin = r => r === "admin";
export const isMgr   = r => ["admin","mgr_ps","mgr_dl"].includes(r);
export const isPM    = r => r === "pm";
export const actsFor = r => {
  const t = teamOf(r);
  return Object.entries(ACTS)
    .filter(([,v]) => t === "all" || v.team === t)
    .reduce((acc,[k,v]) => ({...acc,[k]:v}), {});
};
