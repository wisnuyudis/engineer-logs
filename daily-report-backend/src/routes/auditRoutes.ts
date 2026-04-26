import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import { getAuditLogs } from '../controllers/auditController';

const router = Router();

router.use(authenticateToken);
router.get('/', getAuditLogs);

export default router;
