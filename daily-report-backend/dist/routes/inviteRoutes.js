"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const inviteController_1 = require("../controllers/inviteController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = (0, express_1.Router)();
// Only admin or managers can invite
router.post('/', authMiddleware_1.authenticateToken, (0, authMiddleware_1.requireRole)(['admin', 'delivery_manager', 'sales_manager']), inviteController_1.inviteUser);
exports.default = router;
