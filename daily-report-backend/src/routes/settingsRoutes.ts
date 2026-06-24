import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import { getSmtpSettings, testSmtpSettings, updateSmtpSettings } from '../controllers/settingsController';
import { getMaintenanceSettings, updateMaintenanceSettings } from '../controllers/maintenanceController';

const router = Router();

router.use(authenticateToken);
router.get('/smtp', getSmtpSettings);
router.put('/smtp', updateSmtpSettings);
router.post('/smtp/test', testSmtpSettings);
router.get('/maintenance', getMaintenanceSettings);
router.put('/maintenance', updateMaintenanceSettings);

export default router;
