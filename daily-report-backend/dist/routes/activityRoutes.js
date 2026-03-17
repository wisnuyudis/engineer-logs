"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const activityController_1 = require("../controllers/activityController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = (0, express_1.Router)();
// Ensure uploads dir exists
const uploadDir = path_1.default.join(__dirname, '../../uploads');
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
// Configure multer storage
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path_1.default.extname(file.originalname);
        const unique = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        cb(null, `${unique}${ext}`);
    }
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
});
router.use(authMiddleware_1.authenticateToken); // Guard all activity routes
router.get('/', activityController_1.getActivities);
router.post('/', activityController_1.createActivity);
router.patch('/:id', activityController_1.updateActivity);
router.delete('/:id', activityController_1.deleteActivity);
router.post('/:id/attachments', upload.single('file'), activityController_1.uploadAttachment);
router.delete('/attachments/:attId', activityController_1.deleteAttachment);
exports.default = router;
