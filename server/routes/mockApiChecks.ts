import { Router, Request, Response } from 'express';
import express from 'express';

const router = Router();

// In-memory store for mock student statuses
// Key: stepKey, Value: Map<studentId, boolean>
const mockData = new Map<string, Map<string, boolean>>();

// Seed some defaults
mockData.set('fafsa', new Map<string, boolean>([
  ['001000001', true],
  ['001000002', false],
  ['001000003', true],
]));
mockData.set('immunizations', new Map<string, boolean>([
  ['001000001', false],
  ['001000002', true],
]));
mockData.set('intent-to-enroll', new Map<string, boolean>([
  ['001000001', true],
  ['001000002', true],
  ['001000003', false],
]));

// GET /api/mock/:checkName/:studentId
// Returns { data: { is_complete: true/false } }
// If student not found in mock data, returns false
router.get('/:checkName/:studentId', (req: Request, res: Response) => {
  const checkName = req.params.checkName as string;
  const studentId = req.params.studentId as string;
  const checkData = mockData.get(checkName);
  const isComplete = checkData?.get(studentId) ?? false;

  // Simulate slight latency
  setTimeout(() => {
    res.json({
      data: {
        is_complete: isComplete,
        student_id: studentId,
        check: checkName,
        checked_at: new Date().toISOString(),
      },
    });
  }, 200 + Math.random() * 300);
});

// POST /api/mock/:checkName/:studentId — set a student's status
// Body: { is_complete: true/false }
router.post('/:checkName/:studentId', express.json(), (req: Request, res: Response) => {
  const checkName = req.params.checkName as string;
  const studentId = req.params.studentId as string;
  const { is_complete } = req.body;

  if (!mockData.has(checkName)) {
    mockData.set(checkName, new Map<string, boolean>());
  }
  mockData.get(checkName)!.set(studentId, Boolean(is_complete));

  res.json({ success: true, checkName, studentId, is_complete: Boolean(is_complete) });
});

// GET /api/mock — list all mock checks and their data
router.get('/', (req: Request, res: Response) => {
  const result: Record<string, Record<string, boolean>> = {};
  for (const [checkName, students] of mockData) {
    result[checkName] = Object.fromEntries(students);
  }
  res.json({ checks: result });
});

// DELETE /api/mock/:checkName — clear a mock check
router.delete('/:checkName', (req: Request, res: Response) => {
  mockData.delete(req.params.checkName as string);
  res.json({ success: true });
});

export default router;
