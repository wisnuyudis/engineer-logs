"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTaxonomy = exports.createTaxonomy = exports.toggleTaxonomy = exports.getAllTaxonomies = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
// Get all taxonomies
const getAllTaxonomies = async (req, res) => {
    try {
        const data = await prisma.masterActivity.findMany({
            orderBy: { createdAt: 'asc' }
        });
        res.json(data);
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
        const data = await prisma.masterActivity.update({
            where: { id },
            data: { isActive }
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
        const updated = await prisma.masterActivity.update({
            where: { id },
            data: req.body
        });
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update taxonomy' });
    }
};
exports.updateTaxonomy = updateTaxonomy;
