import { Router, Request, Response, NextFunction } from 'express';
import { getAllTaxonomies, toggleTaxonomy, createTaxonomy, updateTaxonomy } from '../controllers/taxonomyController';
import { authenticateToken, AuthRequest } from '../middlewares/authMiddleware';

const router = Router();

// Everyone can GET the taxonomy lists
router.get('/', authenticateToken, getAllTaxonomies);

const requireAdminOrLog = (req: AuthRequest, res: Response, next: NextFunction) => {
  const r = req.user?.role || "";
  const match = r.toLowerCase().includes("admin") || r.toLowerCase().includes("super");
  if (!match) return res.status(403).json({ error: `Insufficient permissions. Your role is '${r}', which is not classified as admin.` });
  next();
};

// Only admins can modify the master data
router.put('/:id/toggle', authenticateToken, requireAdminOrLog, toggleTaxonomy);
router.post('/', authenticateToken, requireAdminOrLog, createTaxonomy);
router.put('/:id', authenticateToken, requireAdminOrLog, updateTaxonomy);

export default router;
