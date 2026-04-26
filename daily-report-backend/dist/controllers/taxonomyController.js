"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTaxonomy = exports.createTaxonomy = exports.toggleTaxonomy = exports.getAllTaxonomies = void 0;
const client_1 = require("@prisma/client");
const auditTrail_1 = require("../utils/auditTrail");
const prisma = new client_1.PrismaClient();
const TAXONOMY_PRESENTATION = {
    jira_impl: { label: 'Implementation', desc: 'Pekerjaan implementasi yang tersinkron otomatis dari worklog project.' },
    jira_pm: { label: 'Preventive Maint.', desc: 'Pekerjaan preventive maintenance yang tersinkron otomatis dari worklog.' },
    jira_cm: { label: 'Corrective Maint.', desc: 'Penanganan problem/incident yang tersinkron otomatis dari worklog.' },
    jira_enh: { label: 'Enhancement', desc: 'Permintaan enhancement yang tersinkron otomatis dari worklog.' },
    jira_ops: { label: 'Operational Svc', desc: 'Layanan operasional yang tersinkron otomatis dari worklog.' },
};
// Get all taxonomies
const getAllTaxonomies = async (req, res) => {
    try {
        const data = await prisma.masterActivity.findMany({
            orderBy: { createdAt: 'asc' }
        });
        res.json(data.map((item) => ({
            ...item,
            ...TAXONOMY_PRESENTATION[item.actKey],
        })));
    }
    catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
};
exports.getAllTaxonomies = getAllTaxonomies;
// Toggle Active/Inactive
const toggleTaxonomy = async (req, res) => {
    try {
        const id = req.params.id;
        const { isActive } = req.body;
        const current = await prisma.masterActivity.findUnique({ where: { id } });
        const data = await prisma.masterActivity.update({
            where: { id },
            data: { isActive }
        });
        await (0, auditTrail_1.writeAudit)(req, {
            action: 'taxonomy.toggle',
            entityType: 'master_activity',
            entityId: id,
            before: current,
            after: data,
        });
        res.json(data);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update taxonomy state' });
    }
};
exports.toggleTaxonomy = toggleTaxonomy;
// Create new taxonomy
const createTaxonomy = async (req, res) => {
    try {
        const { actKey, ...rest } = req.body;
        const exists = await prisma.masterActivity.findUnique({ where: { actKey } });
        if (exists)
            return res.status(400).json({ error: 'Activity key (actKey) sudah terdaftar' });
        const created = await prisma.masterActivity.create({
            data: { actKey, ...rest }
        });
        await (0, auditTrail_1.writeAudit)(req, {
            action: 'taxonomy.create',
            entityType: 'master_activity',
            entityId: created.id,
            after: created,
        });
        res.json(created);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create taxonomy' });
    }
};
exports.createTaxonomy = createTaxonomy;
// Update taxonomy
const updateTaxonomy = async (req, res) => {
    try {
        const id = req.params.id;
        const current = await prisma.masterActivity.findUnique({ where: { id } });
        const updated = await prisma.masterActivity.update({
            where: { id },
            data: req.body
        });
        await (0, auditTrail_1.writeAudit)(req, {
            action: 'taxonomy.update',
            entityType: 'master_activity',
            entityId: id,
            before: current,
            after: updated,
        });
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update taxonomy' });
    }
};
exports.updateTaxonomy = updateTaxonomy;
