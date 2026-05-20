import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  getActivities,
  createActivity,
  updateActivity,
  deleteActivity,
  uploadAttachment,
  deleteAttachment,
  downloadAttachment,
  previewAttachment,
} from '../controllers/activityController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = Router();

// Ensure uploads dir exists
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage
const ALLOWED_ATTACHMENTS = new Map([
  ['.pdf', 'application/pdf'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
]);

const safeFilename = (name: string) => (
  name
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'attachment'
);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = safeFilename(path.basename(file.originalname, ext));
    const unique = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `${unique}-${base}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const expectedMime = ALLOWED_ATTACHMENTS.get(ext);
    if (!expectedMime || file.mimetype !== expectedMime) {
      return cb(new Error('Format lampiran hanya boleh PDF, DOCX, atau XLSX.'));
    }
    cb(null, true);
  },
});

router.use(authenticateToken); // Guard all activity routes

router.get('/', getActivities);
router.post('/', createActivity);
router.patch('/:id', updateActivity);
router.delete('/:id', deleteActivity);

const uploadSingleAttachment = (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Ukuran file maksimal 20 MB.' });
    }
    return res.status(400).json({ error: error.message || 'Gagal memproses file lampiran.' });
  });
};

router.post('/:id/attachments', uploadSingleAttachment, uploadAttachment);
router.get('/attachments/:attId/preview', previewAttachment);
router.get('/attachments/:attId/download', downloadAttachment);
router.delete('/attachments/:attId', deleteAttachment);

export default router;
