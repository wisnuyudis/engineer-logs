import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import { getExecutiveReport, getJobReport, getJobReportDetail } from '../controllers/reportController';

const router = Router();

router.use(authenticateToken);
router.get('/executive', getExecutiveReport);
router.get('/jobs', getJobReport);
router.get('/jobs/:issueKey', getJobReportDetail);

export default router;
