"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const taxonomyController_1 = require("../controllers/taxonomyController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = (0, express_1.Router)();
// Everyone can GET the taxonomy lists
router.get('/', authMiddleware_1.authenticateToken, taxonomyController_1.getAllTaxonomies);
const requireAdminOrLog = (req, res, next) => {
    const r = req.user?.role || "";
    const match = r.toLowerCase().includes("admin") || r.toLowerCase().includes("super");
    if (!match)
        return res.status(403).json({ error: `Insufficient permissions. Your role is '${r}', which is not classified as admin.` });
    next();
};
// Only admins can modify the master data
router.put('/:id/toggle', authMiddleware_1.authenticateToken, requireAdminOrLog, taxonomyController_1.toggleTaxonomy);
router.post('/', authMiddleware_1.authenticateToken, requireAdminOrLog, taxonomyController_1.createTaxonomy);
router.put('/:id', authMiddleware_1.authenticateToken, requireAdminOrLog, taxonomyController_1.updateTaxonomy);
exports.default = router;
