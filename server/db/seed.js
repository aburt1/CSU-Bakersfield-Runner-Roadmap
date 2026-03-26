import dotenv from 'dotenv';
dotenv.config();

import { faker, fakerES_MX } from '@faker-js/faker';
import readline from 'readline';
import { createDb } from './pool.js';

faker.seed(42);
fakerES_MX.seed(42);

// ── Constants ──────────────────────────────────────────────────────────
const STUDENT_COUNT = 1234;

const MAJORS = [
  'Business Administration', 'Computer Science', 'Criminal Justice',
  'Psychology', 'Nursing', 'Biology', 'Kinesiology', 'Liberal Studies',
  'Sociology', 'Engineering', 'Child Adolescent and Family Studies',
  'Communications', 'History', 'Public Health', 'Mathematics',
  'English', 'Political Science', 'Chemistry', 'Art', 'Economics',
];

const TAG_POOL = [
  ['first-gen'], ['honors'], ['eop'], ['athlete'], ['veteran'],
  ['first-gen', 'honors'], ['first-gen', 'eop'],
  [], [], [], [],
];

const APPLICANT_TYPES = [
  ...Array(50).fill('First-Time Freshman'),
  ...Array(35).fill('Transfer'),
  ...Array(15).fill('Readmit'),
];

const INTEGRATION_ACTORS = ['PeopleSoft Dev', 'CRM Import', 'Admissions Bot', 'system'];
const STAFF_ACTORS = ['Admin', 'Maria Santos', 'James Chen', 'Pat Williams'];

// ── Helpers ────────────────────────────────────────────────────────────
function pick(arr) { return arr[Math.floor(faker.number.float({ min: 0, max: 0.999999 }) * arr.length)]; }

function generatePhone() {
  const mid = faker.number.int({ min: 600, max: 699 });
  const last = faker.number.int({ min: 1000, max: 9999 });
  return `(661) ${mid}-${last}`;
}

function randomDateBetween(daysAgoStart, daysAgoEnd) {
  const now = Date.now();
  const from = now - daysAgoStart * 86400000;
  const to = now - daysAgoEnd * 86400000;
  return new Date(from + Math.random() * (to - from));
}

async function confirm(message) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase().startsWith('y'));
    });
  });
}

// ── Batch insert helper ────────────────────────────────────────────────
async function batchInsert(db, sql, rows, batchSize = 100) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const cols = batch[0].length;
    const values = [];
    const params = [];
    batch.forEach((row, ri) => {
      const placeholders = row.map((_, ci) => `$${ri * cols + ci + 1}`);
      values.push(`(${placeholders.join(', ')})`);
      params.push(...row);
    });
    const fullSql = sql.replace('__VALUES__', values.join(', '));
    const result = await db.execute(fullSql, params);
    inserted += result.rowCount;
  }
  return inserted;
}

// ── Main ───────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const clean = args.includes('--clean');

  const db = createDb();
  const start = Date.now();

  try {
    // ── Clean mode ───────────────────────────────────────────────────
    if (clean) {
      console.log('Cleaning existing seed-demo data...');
      const r1 = await db.execute("DELETE FROM student_progress WHERE student_id LIKE 'seed-demo-%'");
      const r2 = await db.execute("DELETE FROM audit_log WHERE entity_id LIKE 'seed-demo-%'");
      const r3 = await db.execute("DELETE FROM students WHERE id LIKE 'seed-demo-%'");
      console.log(`  Removed ${r1.rowCount} progress, ${r2.rowCount} audit, ${r3.rowCount} student rows`);
    }

    // ── Safety check ─────────────────────────────────────────────────
    if (!force) {
      const { count } = await db.queryOne('SELECT COUNT(*)::int AS count FROM students');
      if (count > 100) {
        const ok = await confirm(`⚠ Database already has ${count} students. Continue? (y/N) `);
        if (!ok) {
          console.log('Aborted.');
          await db.end();
          process.exit(0);
        }
      }
    }

    // ── Fetch active term and steps ──────────────────────────────────
    const activeTerm = await db.queryOne('SELECT id, name FROM terms WHERE is_active = 1 LIMIT 1');
    if (!activeTerm) {
      console.error('No active term found. Please create one first.');
      await db.end();
      process.exit(1);
    }
    console.log(`Using term: ${activeTerm.name} (id=${activeTerm.id})`);

    const requiredSteps = await db.queryAll(
      'SELECT id, title, sort_order FROM steps WHERE is_optional = 0 AND is_active = 1 AND term_id = $1 ORDER BY sort_order',
      [activeTerm.id]
    );
    const optionalSteps = await db.queryAll(
      'SELECT id, title FROM steps WHERE is_optional = 1 AND is_active = 1 AND term_id = $1',
      [activeTerm.id]
    );
    console.log(`Found ${requiredSteps.length} required steps, ${optionalSteps.length} optional steps`);

    // ── Generate students ────────────────────────────────────────────
    console.log(`Generating ${STUDENT_COUNT} students...`);
    const emailSet = new Set();
    const studentRows = [];
    const studentMeta = []; // keep name + createdAt for later

    for (let i = 0; i < STUDENT_COUNT; i++) {
      const useSpanish = faker.number.float() < 0.4;
      const f = useSpanish ? fakerES_MX : faker;
      const firstName = f.person.firstName();
      const lastName = f.person.lastName();
      const displayName = `${firstName} ${lastName}`;

      // Dedup email
      let base = `${firstName.toLowerCase()}${lastName.charAt(0).toLowerCase()}`;
      base = base.replace(/[^a-z0-9]/g, '');
      let email = `${base}@csub.edu`;
      let suffix = 2;
      while (emailSet.has(email)) {
        email = `${base}${suffix}@csub.edu`;
        suffix++;
      }
      emailSet.add(email);

      const padded = String(i).padStart(4, '0');
      const id = `seed-demo-${padded}`;
      const azureId = `azure-demo-seed-demo-${padded}`;
      const emplid = String(100200000 + i);

      const applicantType = pick(APPLICANT_TYPES);
      const major = pick(MAJORS);
      const residency = faker.number.float() < 0.8 ? 'In-State' : 'Out-of-State';
      const phone = generatePhone();
      const preferredName = faker.number.float() < 0.15 ? f.person.firstName() : null;

      const tagArr = pick(TAG_POOL);
      const tags = tagArr.length > 0 ? JSON.stringify(tagArr) : null;

      const createdAt = randomDateBetween(60, 30);
      const admitTerm = activeTerm.name;

      studentRows.push([
        id, displayName, email, azureId, tags, activeTerm.id,
        createdAt.toISOString(), emplid, preferredName, phone,
        applicantType, major, residency, admitTerm, createdAt.toISOString(),
      ]);
      studentMeta.push({ id, displayName, createdAt });
    }

    const studentSql = `INSERT INTO students
      (id, display_name, email, azure_id, tags, term_id, created_at, emplid,
       preferred_name, phone, applicant_type, major, residency, admit_term, last_synced_at)
      VALUES __VALUES__
      ON CONFLICT (id) DO NOTHING`;

    const studentsInserted = await batchInsert(db, studentSql, studentRows);
    console.log(`  Inserted ${studentsInserted} students`);

    // ── Generate progress ────────────────────────────────────────────
    console.log('Generating progress records...');
    const totalLevels = requiredSteps.length + 1; // 0 through N
    const progressRows = [];
    const auditRows = [];

    for (let i = 0; i < STUDENT_COUNT; i++) {
      const level = Math.floor(i / (STUDENT_COUNT / totalLevels));
      const completionLevel = Math.min(level, requiredSteps.length);
      const { id: studentId, displayName: studentName, createdAt } = studentMeta[i];

      let cursor = new Date(createdAt.getTime());

      for (let s = 0; s < completionLevel; s++) {
        const step = requiredSteps[s];
        const status = faker.number.float() < 0.9 ? 'completed' : 'waived';
        const completedBy = faker.number.float() < 0.7 ? 'integration' : 'manual';
        const daysOffset = faker.number.int({ min: 1, max: 3 });
        cursor = new Date(cursor.getTime() + daysOffset * 86400000);
        const completedAt = cursor.toISOString();

        progressRows.push([studentId, step.id, completedAt, status, null, completedBy]);

        // Determine action
        let action;
        if (completedBy === 'integration') {
          action = status === 'completed' ? 'integration_complete' : 'integration_waive';
        } else {
          action = status === 'completed' ? 'complete' : 'waive';
        }

        // Determine changed_by
        let changedBy;
        const roll = faker.number.float();
        if (roll < 0.7) {
          changedBy = pick(INTEGRATION_ACTORS);
        } else if (roll < 0.9) {
          changedBy = studentName;
        } else {
          changedBy = pick(STAFF_ACTORS);
        }

        const details = JSON.stringify({
          stepId: step.id,
          stepTitle: step.title,
          studentName,
          result: 'created',
        });

        auditRows.push(['student_progress', studentId, action, changedBy, details, completedAt]);
      }

      // ~30% get a random optional step
      if (optionalSteps.length > 0 && faker.number.float() < 0.3) {
        const optStep = pick(optionalSteps);
        const status = faker.number.float() < 0.9 ? 'completed' : 'waived';
        const completedBy = faker.number.float() < 0.7 ? 'integration' : 'manual';
        const daysOffset = faker.number.int({ min: 1, max: 3 });
        cursor = new Date(cursor.getTime() + daysOffset * 86400000);
        const completedAt = cursor.toISOString();

        progressRows.push([studentId, optStep.id, completedAt, status, null, completedBy]);

        let action;
        if (completedBy === 'integration') {
          action = status === 'completed' ? 'integration_complete' : 'integration_waive';
        } else {
          action = status === 'completed' ? 'complete' : 'waive';
        }

        const roll = faker.number.float();
        let changedBy;
        if (roll < 0.7) changedBy = pick(INTEGRATION_ACTORS);
        else if (roll < 0.9) changedBy = studentName;
        else changedBy = pick(STAFF_ACTORS);

        const details = JSON.stringify({
          stepId: optStep.id,
          stepTitle: optStep.title,
          studentName,
          result: 'created',
        });
        auditRows.push(['student_progress', studentId, action, changedBy, details, completedAt]);
      }
    }

    const progressSql = `INSERT INTO student_progress
      (student_id, step_id, completed_at, status, note, completed_by)
      VALUES __VALUES__
      ON CONFLICT (student_id, step_id) DO NOTHING`;
    const progressInserted = await batchInsert(db, progressSql, progressRows);

    // ── Generate audit log entries ───────────────────────────────────
    console.log('Generating audit log entries...');

    const auditSql = `INSERT INTO audit_log
      (entity_type, entity_id, action, changed_by, details, created_at)
      VALUES __VALUES__`;

    // Extra tag-update entries (~200)
    for (let i = 0; i < 200; i++) {
      const student = studentMeta[faker.number.int({ min: 0, max: STUDENT_COUNT - 1 })];
      const tagArr = pick(TAG_POOL);
      const details = JSON.stringify({
        tags: tagArr,
        studentName: student.displayName,
        result: 'updated',
      });
      const roll = faker.number.float();
      let changedBy;
      if (roll < 0.7) changedBy = pick(INTEGRATION_ACTORS);
      else if (roll < 0.9) changedBy = student.displayName;
      else changedBy = pick(STAFF_ACTORS);
      const ts = new Date(student.createdAt.getTime() + faker.number.int({ min: 1, max: 30 }) * 86400000);
      auditRows.push(['student_tags', student.id, 'tags_update', changedBy, details, ts.toISOString()]);
    }

    // Extra profile-sync entries (~200)
    for (let i = 0; i < 200; i++) {
      const student = studentMeta[faker.number.int({ min: 0, max: STUDENT_COUNT - 1 })];
      const details = JSON.stringify({
        studentName: student.displayName,
        result: 'synced',
      });
      const changedBy = pick(INTEGRATION_ACTORS);
      const ts = new Date(student.createdAt.getTime() + faker.number.int({ min: 1, max: 30 }) * 86400000);
      auditRows.push(['student_profile', student.id, 'student_profile_update', changedBy, details, ts.toISOString()]);
    }

    const auditInserted = await batchInsert(db, auditSql, auditRows);

    // ── Summary ──────────────────────────────────────────────────────
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n\u2713 Seed complete in ${elapsed}s`);
    console.log(`  \u2022 ${studentsInserted.toLocaleString()} students`);
    console.log(`  \u2022 ${progressInserted.toLocaleString()} progress records`);
    console.log(`  \u2022 ${auditInserted.toLocaleString()} audit log entries`);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

main();
