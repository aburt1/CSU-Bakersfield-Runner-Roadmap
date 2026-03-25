import { createDb } from './pool.js';
import { importFall2026Checklist } from '../utils/onboardingChecklistImport.js';
import { ensureStepKeys } from '../utils/stepKeys.js';

export async function initDatabase() {
  const db = createDb();

  // Create tables
  await db.execute(`
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      display_name TEXT,
      email TEXT,
      azure_id TEXT UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS steps (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      sort_order INTEGER NOT NULL,
      deadline TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS student_progress (
      student_id TEXT NOT NULL,
      step_id INTEGER NOT NULL,
      completed_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (student_id, step_id),
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (step_id) REFERENCES steps(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      changed_by TEXT NOT NULL,
      details TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC)`);

  // Migrations — add new columns (safe to re-run)
  const migrations = [
    'ALTER TABLE steps ADD COLUMN IF NOT EXISTS guide_content TEXT',
    'ALTER TABLE steps ADD COLUMN IF NOT EXISTS links TEXT',
    'ALTER TABLE steps ADD COLUMN IF NOT EXISTS required_tags TEXT',
    "ALTER TABLE steps ADD COLUMN IF NOT EXISTS required_tag_mode TEXT DEFAULT 'any'",
    'ALTER TABLE steps ADD COLUMN IF NOT EXISTS excluded_tags TEXT',
    'ALTER TABLE steps ADD COLUMN IF NOT EXISTS is_active INTEGER DEFAULT 1',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS tags TEXT',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS emplid TEXT',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS preferred_name TEXT',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS phone TEXT',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS applicant_type TEXT',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS major TEXT',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS residency TEXT',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS admit_term TEXT',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ',
    "ALTER TABLE student_progress ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed'",
    'ALTER TABLE student_progress ADD COLUMN IF NOT EXISTS note TEXT',
    'ALTER TABLE steps ADD COLUMN IF NOT EXISTS contact_info TEXT',
    'ALTER TABLE steps ADD COLUMN IF NOT EXISTS term_id INTEGER',
    'ALTER TABLE steps ADD COLUMN IF NOT EXISTS deadline_date TEXT',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS term_id INTEGER',
    'ALTER TABLE steps ADD COLUMN IF NOT EXISTS is_public INTEGER DEFAULT 0',
    'ALTER TABLE steps ADD COLUMN IF NOT EXISTS step_key TEXT',
    'ALTER TABLE steps ADD COLUMN IF NOT EXISTS is_optional INTEGER DEFAULT 0',
    'ALTER TABLE students ADD COLUMN IF NOT EXISTS last_api_check_at TIMESTAMPTZ',
    "ALTER TABLE student_progress ADD COLUMN IF NOT EXISTS completed_by VARCHAR(20) DEFAULT 'manual'",
  ];
  for (const sql of migrations) {
    await db.execute(sql);
  }

  // Create terms table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS terms (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Backfill legacy rows after terms exist.
  const latestTerm = await db.queryOne('SELECT id FROM terms ORDER BY id DESC LIMIT 1');
  if (latestTerm?.id) {
    await db.execute('UPDATE steps SET term_id = $1 WHERE term_id IS NULL', [latestTerm.id]);
    await db.execute('UPDATE students SET term_id = $1 WHERE term_id IS NULL', [latestTerm.id]);
  }

  // Seed default term if empty and backfill existing data
  const termCount = await db.queryOne('SELECT COUNT(*) as count FROM terms');
  if (parseInt(termCount.count) === 0) {
    await db.execute(
      "INSERT INTO terms (name, start_date, end_date, is_active) VALUES ('Fall 2026', '2026-08-01', '2026-12-31', 1)"
    );
    await db.execute('UPDATE steps SET term_id = 1 WHERE term_id IS NULL');
    await db.execute('UPDATE students SET term_id = 1 WHERE term_id IS NULL');
    // Default term seeded: Fall 2026
  }

  // Create admin_users table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      display_name TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS integration_clients (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      key_hash TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS integration_events (
      id SERIAL PRIMARY KEY,
      integration_client_id INTEGER NOT NULL,
      source_event_id TEXT NOT NULL,
      student_id_number TEXT,
      step_key TEXT,
      request_body TEXT,
      response_status INTEGER NOT NULL,
      response_body TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (integration_client_id) REFERENCES integration_clients(id)
    )
  `);

  // API check configuration per step (1:1 relationship)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS step_api_checks (
      id SERIAL PRIMARY KEY,
      step_id INTEGER NOT NULL UNIQUE REFERENCES steps(id) ON DELETE CASCADE,
      is_enabled BOOLEAN DEFAULT false,
      http_method VARCHAR(10) DEFAULT 'GET',
      url TEXT NOT NULL,
      auth_type VARCHAR(20) DEFAULT 'none',
      auth_credentials TEXT,
      headers TEXT,
      student_param_name VARCHAR(100) DEFAULT 'studentId',
      student_param_source VARCHAR(50) DEFAULT 'emplid',
      response_field_path VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Seed default superadmin if empty
  const adminCount = await db.queryOne('SELECT COUNT(*) as count FROM admin_users');
  if (parseInt(adminCount.count) === 0) {
    const bcrypt = await import('bcrypt');
    const email = process.env.ADMIN_DEFAULT_EMAIL || 'admin@csub.edu';
    const password = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123';
    if (!process.env.ADMIN_DEFAULT_PASSWORD && process.env.NODE_ENV === 'production') {
      console.warn('[db-init] WARNING: Using default admin password in production. Set ADMIN_DEFAULT_PASSWORD env var.');
    }
    const hash = await bcrypt.hash(password, 10);
    await db.execute(
      'INSERT INTO admin_users (email, password_hash, role, display_name) VALUES ($1, $2, $3, $4)',
      [email, hash, 'sysadmin', 'Admin']
    );
  }

  // Seed default integration client in dev or when explicitly configured.
  const integrationCount = await db.queryOne('SELECT COUNT(*) as count FROM integration_clients');
  if (parseInt(integrationCount.count) === 0 && (process.env.NODE_ENV !== 'production' || process.env.INTEGRATION_DEFAULT_KEY)) {
    const bcrypt = await import('bcrypt');
    const clientName = process.env.INTEGRATION_DEFAULT_NAME || 'PeopleSoft Dev';
    const clientKey = process.env.INTEGRATION_DEFAULT_KEY || 'dev-integration-key';
    const keyHash = await bcrypt.hash(clientKey, 10);
    await db.execute(
      'INSERT INTO integration_clients (name, key_hash, is_active) VALUES ($1, $2, 1)',
      [clientName, keyHash]
    );

    // Default integration client seeded
  }

  // Seed default Fall 2026 checklist if empty
  const count = await db.queryOne('SELECT COUNT(*) as count FROM steps');
  if (parseInt(count.count) === 0) {
    const defaultTerm = await db.queryOne('SELECT id FROM terms WHERE is_active = 1 ORDER BY id LIMIT 1');
    const seedTermId = defaultTerm?.id || null;
    if (seedTermId) {
      const importResult = await importFall2026Checklist(db, seedTermId, { deactivateUnmatched: false });
      // Fall 2026 onboarding checklist seeded
    }
  }

  await ensureStepKeys(db);

  // Create indexes (idempotent)
  try {
    await db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_students_emplid_unique
      ON students (lower(trim(emplid)))
      WHERE emplid IS NOT NULL AND trim(emplid) <> ''
    `);
  } catch (error) {
    console.warn('[db-init] Unable to create unique Student ID # index:', error.message);
  }

  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_steps_term_step_key_unique
    ON steps (term_id, step_key)
    WHERE term_id IS NOT NULL AND step_key IS NOT NULL AND trim(step_key) <> ''
  `);

  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_events_unique
    ON integration_events (integration_client_id, source_event_id)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_steps_step_key_lookup
    ON steps (term_id, step_key)
  `);

  // Seed 50 sample students if empty (development only)
  const studentCount = await db.queryOne('SELECT COUNT(*) as count FROM students');
  if (parseInt(studentCount.count) === 0 && process.env.NODE_ENV !== 'production') {
    const defaultTerm = await db.queryOne('SELECT id FROM terms WHERE is_active = 1 ORDER BY id LIMIT 1');
    const termId = defaultTerm?.id || 1;
    const stepRows = await db.queryAll(
      `SELECT id, sort_order FROM steps WHERE term_id = $1 AND COALESCE(is_optional, 0) = 0 ORDER BY sort_order`,
      [termId]
    );

    // Realistic first/last name pools (diverse Central Valley demographics)
    const firstNames = [
      'Sofia', 'Miguel', 'Emily', 'Jose', 'Maria', 'David', 'Isabella', 'Carlos',
      'Ashley', 'Angel', 'Jasmine', 'Luis', 'Alyssa', 'Diego', 'Samantha', 'Juan',
      'Brianna', 'Daniel', 'Gabriela', 'Andres', 'Maya', 'Kevin', 'Priya', 'Omar',
      'Rachel', 'Alejandro', 'Destiny', 'Marco', 'Chloe', 'Eduardo', 'Fatima', 'Ethan',
      'Lucia', 'Ryan', 'Vanessa', 'Jorge', 'Mia', 'Anthony', 'Karina', 'Tyler',
      'Andrea', 'Nathan', 'Rosa', 'Brandon', 'Jessica', 'Victor', 'Lauren', 'Adrian',
      'Natalie', 'Christian',
    ];
    const lastNames = [
      'Garcia', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Perez',
      'Sanchez', 'Rivera', 'Torres', 'Flores', 'Ramirez', 'Morales', 'Cruz', 'Reyes',
      'Nguyen', 'Patel', 'Singh', 'Chen', 'Kim', 'Johnson', 'Williams', 'Brown',
      'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas',
      'Jackson', 'White', 'Harris', 'Clark', 'Lewis', 'Walker', 'Hall', 'Allen',
      'Young', 'King', 'Wright', 'Scott', 'Adams', 'Baker', 'Nelson', 'Carter',
      'Mitchell', 'Campbell', 'Roberts', 'Phillips',
    ];

    const applicantTypes = ['First-Time Freshman', 'Transfer', 'First-Time Freshman', 'Transfer', 'Readmit'];
    const majors = [
      'Business Administration', 'Computer Science', 'Psychology', 'Nursing',
      'Mechanical Engineering', 'Biology', 'Criminal Justice', 'Kinesiology',
      'Sociology', 'Liberal Studies',
    ];
    const residencies = ['In-State', 'In-State', 'In-State', 'Out-of-State'];
    const manualTagOptions = [
      ['first-gen'], ['honors'], ['eop'], ['athlete'], ['veteran'],
      ['first-gen', 'honors'], [], [],
    ];

    const progressionWeights = [
      { stepsCompleted: 0, weight: 2 },
      { stepsCompleted: 1, weight: 3 },
      { stepsCompleted: 2, weight: 5 },
      { stepsCompleted: 3, weight: 6 },
      { stepsCompleted: 4, weight: 7 },
      { stepsCompleted: 5, weight: 8 },
      { stepsCompleted: 6, weight: 7 },
      { stepsCompleted: 7, weight: 5 },
      { stepsCompleted: 8, weight: 4 },
      { stepsCompleted: 9, weight: 3 },
    ];

    const progressionPool = [];
    for (const p of progressionWeights) {
      for (let i = 0; i < p.weight; i++) {
        progressionPool.push(p.stepsCompleted);
      }
    }

    await db.transaction(async (txDb) => {
      for (let i = 0; i < 50; i++) {
        const first = firstNames[i];
        const last = lastNames[i % lastNames.length];
        const name = `${first} ${last}`;
        const email = `${first.toLowerCase()}${last.toLowerCase().charAt(0)}@csub.edu`;
        const id = `seed-student-${String(i + 1).padStart(3, '0')}`;
        const azureId = `azure-${id}`;
        const applicantType = applicantTypes[i % applicantTypes.length];
        const major = majors[i % majors.length];
        const residency = residencies[i % residencies.length];
        const emplid = `00${String(1000000 + i)}`;
        const preferredName = i % 6 === 0 ? first : null;
        const phone = `(661) 654-${String(1200 + i).padStart(4, '0')}`;
        const admitTerm = 'Fall 2026';
        const lastSyncedAt = new Date(Date.now() - (i % 10) * 3600000).toISOString();

        const manualTags = manualTagOptions[i % manualTagOptions.length];

        const daysAgo = Math.floor(Math.random() * 60) + 1;
        const createdAt = new Date(Date.now() - daysAgo * 86400000).toISOString();

        await txDb.execute(
          `INSERT INTO students (
            id, display_name, email, azure_id, tags, term_id, created_at, emplid,
            preferred_name, phone, applicant_type, major, residency, admit_term, last_synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            id, name, email, azureId,
            manualTags.length > 0 ? JSON.stringify(manualTags) : null,
            termId, createdAt, emplid, preferredName, phone,
            applicantType, major, residency, admitTerm, lastSyncedAt,
          ]
        );

        const stepsCompleted = progressionPool[i % progressionPool.length];
        const completableSteps = stepRows.slice(0, stepsCompleted);

        for (let j = 0; j < completableSteps.length; j++) {
          const step = completableSteps[j];
          const completionDaysAgo = daysAgo - j * 2 - Math.floor(Math.random() * 3);
          const completedAt = new Date(Date.now() - Math.max(completionDaysAgo, 1) * 86400000).toISOString();
          const status = (Math.random() < 0.05) ? 'waived' : 'completed';

          await txDb.execute(
            'INSERT INTO student_progress (student_id, step_id, completed_at, status) VALUES ($1, $2, $3, $4)',
            [id, step.id, completedAt, status]
          );
        }
      }
    });

    // 50 sample students seeded
  }

  return db;
}
