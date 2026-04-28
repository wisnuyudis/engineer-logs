import { Router } from 'express';
import { getUsers, createUser, updateUser, deleteUser, resetUserPassword } from '../controllers/userController';
import { authenticateToken, requireRole } from '../middlewares/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.get('/', getUsers);
router.post('/', createUser);
router.patch('/:id', updateUser);
router.patch('/:id/reset-password', requireRole(['admin']), resetUserPassword);
router.delete('/:id', deleteUser);

export default router;
