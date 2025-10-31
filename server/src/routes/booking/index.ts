import { Router } from 'express';
import reservationsRoutes from './reservations.js';
import financialsRoutes from './financials.js';
import notesRoutes from './notes.js';

const router = Router();

router.use('/reservations', reservationsRoutes);
router.use('/financials', financialsRoutes);
router.use('/notes', notesRoutes);

export default router;
