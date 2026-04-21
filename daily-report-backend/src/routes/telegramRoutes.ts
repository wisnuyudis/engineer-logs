import { Router } from 'express';
import { generateLinkToken, getTelegramStatus } from '../controllers/telegramController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = Router();

router.post('/generate-link', authenticateToken, generateLinkToken);
router.get('/status', authenticateToken, getTelegramStatus);

export default router;
