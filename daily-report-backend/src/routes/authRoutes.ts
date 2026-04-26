import { Router } from 'express';
import { login, refreshToken, logout, getProfile, updateProfile, changePassword } from '../controllers/authController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = Router();

router.post('/login', login);
router.post('/refresh', refreshToken);
router.post('/logout', logout);
router.get('/profile', authenticateToken, getProfile);
router.patch('/profile', authenticateToken, updateProfile);
router.patch('/password', authenticateToken, changePassword);

export default router;
