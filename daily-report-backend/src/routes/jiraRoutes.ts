import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import {
  beginJiraConnect,
  disconnectJira,
  getJiraStatus,
  handleJiraCallback,
  handleJiraWorklogWebhook,
} from '../controllers/jiraController';

const router = Router();

router.post('/webhooks/worklog', handleJiraWorklogWebhook);

router.get('/callback', handleJiraCallback);

router.use(authenticateToken);
router.get('/status', getJiraStatus);
router.post('/connect', beginJiraConnect);
router.post('/disconnect', disconnectJira);

export default router;
