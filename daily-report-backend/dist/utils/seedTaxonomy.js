"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const ACTS = [
    // ── DELIVERY ──
    { actKey: "jira_impl", label: "Implementation", icon: "🗂", color: "#0D9488", colorLo: "#0D948820", team: "delivery", source: "jira", kpiDomain: "impl", desc: "Project task dari Jira (PROJ-xxx)" },
    { actKey: "jira_pm", label: "Preventive Maint.", icon: "🔧", color: "#D97706", colorLo: "#D9770620", team: "delivery", source: "jira", kpiDomain: "pm", desc: "PM ticket dari Jira (MAINT-xxx)" },
    { actKey: "jira_cm", label: "Corrective Maint.", icon: "🚨", color: "#DC2626", colorLo: "#DC262620", team: "delivery", source: "jira", kpiDomain: "cm", desc: "Incident/CM ticket dari Jira (CM-xxx / SUP-xxx)" },
    { actKey: "jira_enh", label: "Enhancement", icon: "⚡", color: "#4F46E5", colorLo: "#4F46E520", team: "delivery", source: "jira", kpiDomain: "enh", desc: "Enhancement request dari Jira" },
    { actKey: "jira_ops", label: "Operational Svc", icon: "⚙️", color: "#7C3AED", colorLo: "#7C3AED20", team: "delivery", source: "jira", kpiDomain: "ops", desc: "Ops/KB4 task dari Jira" },
    { actKey: "pm_presentation", label: "Q PM Presentation", icon: "📊", color: "#F472B6", colorLo: "#2A0F1E", team: "delivery", source: "app", kpiDomain: "pm", desc: "Presentasi Quarterly PM ke Customer" },
    { actKey: "learning", label: "Learning & Dev", icon: "📚", color: "#22D3EE", colorLo: "#0C2230", team: "delivery", source: "app", desc: "Belajar mandiri, sertifikasi" },
    { actKey: "internal", label: "Internal Meeting", icon: "💬", color: "#94A3B8", colorLo: "#1A1F2E", team: "delivery", source: "app", desc: "Rapat internal" },
    { actKey: "koordinasi", label: "Koordinasi Klien", icon: "🤝", color: "#FB923C", colorLo: "#2A1800", team: "delivery", source: "app", desc: "Koordinasi luar Jira ticket" },
    // ── PRE-SALES ──
    { actKey: "prospecting", label: "Prospecting", icon: "🔍", color: "#7C3AED", colorLo: "#7C3AED20", team: "presales", source: "app" },
    { actKey: "demo", label: "Demo & Presentasi", icon: "🎯", color: "#C084FC", colorLo: "#1E1030", team: "presales", source: "app" },
    { actKey: "proposal", label: "Proposal / SOW", icon: "📋", color: "#E879F9", colorLo: "#2A0F30", team: "presales", source: "app" },
    { actKey: "negotiation", label: "Negosiasi", icon: "🤝", color: "#0D9488", colorLo: "#0D948820", team: "presales", source: "app" },
    { actKey: "survey", label: "Site Survey", icon: "📐", color: "#D97706", colorLo: "#D9770620", team: "presales", source: "app" },
    { actKey: "ps_learning", label: "Learning & Dev", icon: "📚", color: "#22D3EE", colorLo: "#0C2230", team: "presales", source: "app" },
    { actKey: "ps_internal", label: "Internal Meeting", icon: "💬", color: "#94A3B8", colorLo: "#1A1F2E", team: "presales", source: "app" }
];
async function main() {
    console.log("Seeding Taxonomy...");
    for (const act of ACTS) {
        await prisma.masterActivity.upsert({
            where: { actKey: act.actKey },
            update: {},
            create: act
        });
    }
    console.log("Seeding complete!");
}
main().catch(e => {
    console.error(e);
    process.exit(1);
}).finally(() => prisma.$disconnect());
