import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import { authenticateCliRequest } from '../middlewares/cliAuthMiddleware';
import {
  createCliActivity,
  exchangeCliLinkToken,
  generateCliLinkToken,
  getCliActivities,
  getCliCategories,
  getCliMe,
  getCliStatus,
} from '../controllers/cliController';

const router = Router();

router.post('/generate-link', authenticateToken, generateCliLinkToken);
router.get('/status', authenticateToken, getCliStatus);
router.post('/auth', exchangeCliLinkToken);

router.use(authenticateCliRequest);
router.get('/me', getCliMe);
router.get('/categories', getCliCategories);
router.get('/activities', getCliActivities);
router.post('/activities', createCliActivity);

export default router;
