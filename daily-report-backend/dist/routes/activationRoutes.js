"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const activationController_1 = require("../controllers/activationController");
const router = (0, express_1.Router)();
// Public route for activation
router.post('/', activationController_1.activateUser);
exports.default = router;
