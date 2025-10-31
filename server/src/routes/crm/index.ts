import { Router } from 'express';
import contactsRoutes from './contacts.js';
import leadSourcesRoutes from './lead-sources.js';

const router = Router();

router.use('/contacts', contactsRoutes);
router.use('/lead-sources', leadSourcesRoutes);

export default router;
