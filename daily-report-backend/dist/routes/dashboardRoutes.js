"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dashboardController_1 = require("../controllers/dashboardController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken); // Protect dashboard APIs
router.get('/metrics', dashboardController_1.getMetrics);
router.get('/leaderboard', dashboardController_1.getLeaderboard);
router.get('/jira-schedule/:userId', dashboardController_1.getUpcomingJiraSchedule);
exports.default = router;
