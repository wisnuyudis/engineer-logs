import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import { createCustomer, getCustomers, getJiraOrganizationSuggestions, toggleCustomer, updateCustomer } from '../controllers/customerController';

const router = Router();

router.use(authenticateToken);
router.get('/', getCustomers);
router.get('/jira-organizations', getJiraOrganizationSuggestions);
router.post('/', createCustomer);
router.put('/:id', updateCustomer);
router.put('/:id/toggle', toggleCustomer);

export default router;
