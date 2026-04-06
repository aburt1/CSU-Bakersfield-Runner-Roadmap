import { Router } from 'express';
import { adminAuth } from '../../middleware/adminAuth.js';
import stepsRouter from './steps.js';
import studentsRouter from './students.js';
import analyticsRouter from './analytics.js';
import termsRouter from './terms.js';
import usersRouter from './users.js';

const router = Router();

// All admin routes require authentication
router.use(adminAuth);

router.use(stepsRouter);
router.use(studentsRouter);
router.use(analyticsRouter);
router.use(termsRouter);
router.use(usersRouter);

export default router;
