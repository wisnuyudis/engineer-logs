export const TEAM_COLORS = {
  delivery: "#14b8a6",
  presales: "#8b5cf6",
  all: "#6366f1"
};

export const PS_STAGES = ["Contacted","Demo Scheduled","Demo Done","Proposal Sent","Negotiation","Won","Lost"];

export const ROLES = {
  "SE":             { label:"System Engineer",     lvl:1, color:"#10B981", lo:"#10B98120" },
  "PM":             { label:"Project Manager",     lvl:2, color:"#14B8A6", lo:"#14B8A620" },
  "delivery":       { label:"Delivery Engineer",   lvl:1, color:"#10B981", lo:"#10B98120" },
  "mgr_dl":         { label:"Head of Delivery",    lvl:3, color:"#14B8A6", lo:"#14B8A620" },
  "Head Delivery":  { label:"Head of Delivery",    lvl:3, color:"#14B8A6", lo:"#14B8A620" },
  
  "Sales Engineer": { label:"Sales Engineer",      lvl:1, color:"#8B5CF6", lo:"#8B5CF620" },
  "Presales":       { label:"Presales Engineer",   lvl:1, color:"#8B5CF6", lo:"#8B5CF620" },
  "presales":       { label:"Presales Engineer",   lvl:1, color:"#8B5CF6", lo:"#8B5CF620" },
  "mgr_ps":         { label:"Head of Presales",    lvl:3, color:"#6366F1", lo:"#6366F120" },
  "Head Presales":  { label:"Head of Presales",    lvl:3, color:"#6366F1", lo:"#6366F120" },
  
  "Admin":          { label:"Administrator",       lvl:9, color:"#F59E0B", lo:"#F59E0B20" },
  "admin":          { label:"Administrator",       lvl:9, color:"#F59E0B", lo:"#F59E0B20" }
};

export const teamOf = (role) => {
  const r = (role || "").toLowerCase();
  if (["se", "pm", "head delivery", "mgr_dl", "delivery", "engineer"].includes(r)) return "delivery";
  if (["sales engineer", "presales", "head presales", "mgr_ps", "pre-sales"].includes(r)) return "presales";
  return "all";
};

export const isPM = (role) => {
  const r = (role || "").toLowerCase();
  return r === "pm" || r === "manager";
};

export const isAdmin = (role) => ["Admin", "admin", "superadmin", "Superadmin", "super_admin", "Super Admin", "super admin"].includes(role);

export const isMgr = (role) => ["Admin", "admin", "superadmin", "Superadmin", "super_admin", "Super Admin", "super admin", "Head Delivery", "Head Presales", "mgr_ps", "mgr_dl"].includes(role);

export const getKpiTarget = (domainKey, user) => {
  if (user?.role === "PM" && domainKey === "pm") return 30; // 30 jam target
  const tgts = {
    "SE": { "impl":40, "pm":15, "cm":15, "enh":10, "ops":5 },
    "Head Delivery": { "impl":20, "pm":10, "cm":5, "enh":5, "ops":5 }
  };
  return tgts[user?.role]?.[domainKey] || 0;
};

export const actsFor = (role, ACTS) => {
  if (!ACTS) return {};
  if (isAdmin(role)) return ACTS; // Superadmin has access to ALL activities

  const team = teamOf(role);
  const allowed = {};
  for (const [k,v] of Object.entries(ACTS)) {
    if (v.team === team || v.team === "all") allowed[k] = v;
  }
  return allowed;
};
