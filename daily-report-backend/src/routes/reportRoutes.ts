import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import { getExecutiveReport, getJobReport } from '../controllers/reportController';

const router = Router();

router.use(authenticateToken);
router.get('/executive', getExecutiveReport);
router.get('/jobs', getJobReport);

export default router;
