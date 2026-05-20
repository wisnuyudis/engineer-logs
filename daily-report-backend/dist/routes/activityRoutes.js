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
const ALLOWED_ATTACHMENTS = new Map([
    ['.pdf', 'application/pdf'],
    ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
]);
const safeFilename = (name) => (name
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'attachment');
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        const base = safeFilename(path_1.default.basename(file.originalname, ext));
        const unique = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        cb(null, `${unique}-${base}${ext}`);
    }
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
    fileFilter: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        const expectedMime = ALLOWED_ATTACHMENTS.get(ext);
        if (!expectedMime || file.mimetype !== expectedMime) {
            return cb(new Error('Format lampiran hanya boleh PDF, DOCX, atau XLSX.'));
        }
        cb(null, true);
    },
});
router.use(authMiddleware_1.authenticateToken); // Guard all activity routes
router.get('/', activityController_1.getActivities);
router.post('/', activityController_1.createActivity);
router.patch('/:id', activityController_1.updateActivity);
router.delete('/:id', activityController_1.deleteActivity);
const uploadSingleAttachment = (req, res, next) => {
    upload.single('file')(req, res, (error) => {
        if (!error)
            return next();
        if (error instanceof multer_1.default.MulterError && error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Ukuran file maksimal 20 MB.' });
        }
        return res.status(400).json({ error: error.message || 'Gagal memproses file lampiran.' });
    });
};
router.post('/:id/attachments', uploadSingleAttachment, activityController_1.uploadAttachment);
router.get('/attachments/:attId/preview', activityController_1.previewAttachment);
router.get('/attachments/:attId/download', activityController_1.downloadAttachment);
router.delete('/attachments/:attId', activityController_1.deleteAttachment);
exports.default = router;
