import { Router } from 'express';
import { login, getProfile, updateProfile, changePassword } from '../controllers/authController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = Router();

router.post('/login', login);
router.get('/profile', authenticateToken, getProfile);
router.patch('/profile', authenticateToken, updateProfile);
router.patch('/password', authenticateToken, changePassword);

export default router;
