import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import { getSmtpSettings, testSmtpSettings, updateSmtpSettings } from '../controllers/settingsController';

const router = Router();

router.use(authenticateToken);
router.get('/smtp', getSmtpSettings);
router.put('/smtp', updateSmtpSettings);
router.post('/smtp/test', testSmtpSettings);

export default router;
