import { Router } from 'express';
import { inviteUser } from '../controllers/inviteController';
import { authenticateToken, requireRole } from '../middlewares/authMiddleware';

const router = Router();

// Only admin or managers can invite
router.post('/', authenticateToken, requireRole(['admin', 'delivery_manager', 'sales_manager']), inviteUser);

export default router;
