import { Router } from 'express';
import { activateUser } from '../controllers/activationController';

const router = Router();

// Public route for activation
router.post('/', activateUser);

export default router;
