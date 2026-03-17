import { Router } from 'express';
import { getMetrics, getLeaderboard } from '../controllers/dashboardController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = Router();

router.use(authenticateToken); // Protect dashboard APIs

router.get('/metrics', getMetrics);
router.get('/leaderboard', getLeaderboard);

export default router;
