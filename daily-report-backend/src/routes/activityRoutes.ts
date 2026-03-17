import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getActivities, createActivity, updateActivity, deleteActivity, uploadAttachment, deleteAttachment } from '../controllers/activityController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = Router();

// Ensure uploads dir exists
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `${unique}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
});

router.use(authenticateToken); // Guard all activity routes

router.get('/', getActivities);
router.post('/', createActivity);
router.patch('/:id', updateActivity);
router.delete('/:id', deleteActivity);

router.post('/:id/attachments', upload.single('file'), uploadAttachment);
router.delete('/attachments/:attId', deleteAttachment);

export default router;
