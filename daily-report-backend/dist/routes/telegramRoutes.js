"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const telegramController_1 = require("../controllers/telegramController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = (0, express_1.Router)();
router.post('/generate-link', authMiddleware_1.authenticateToken, telegramController_1.generateLinkToken);
router.get('/status', authMiddleware_1.authenticateToken, telegramController_1.getTelegramStatus);
exports.default = router;
