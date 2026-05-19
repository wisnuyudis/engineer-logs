import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import {
  getKpiAssignableUsers,
  getKpiNpsEntries,
  getKpiProfiles,
  getUserKpiScorecard,
  recalculateQbMetrics,
  upsertKpiNpsEntry,
  upsertUserKpiScorecard,
} from '../controllers/kpiController';

const router = Router();

router.use(authenticateToken);
router.get('/profiles', getKpiProfiles);
router.get('/users', getKpiAssignableUsers);
router.get('/nps', getKpiNpsEntries);
router.put('/nps', upsertKpiNpsEntry);
router.get('/scorecards/:userId', getUserKpiScorecard);
router.put('/scorecards/:userId', upsertUserKpiScorecard);
router.post('/scorecards/:userId/recalculate-qb', recalculateQbMetrics);

export default router;
