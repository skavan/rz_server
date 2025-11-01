import { Router } from 'express';
import commissionsRoutes from './commissions.js';

const router = Router();

router.use('/commissions', commissionsRoutes);

export default router;
