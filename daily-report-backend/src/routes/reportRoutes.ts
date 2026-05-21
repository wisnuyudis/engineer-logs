import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import { getExecutiveReport } from '../controllers/reportController';

const router = Router();

router.use(authenticateToken);
router.get('/executive', getExecutiveReport);

export default router;
