import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { ensureStepKeys } from '../utils/stepKeys.js';

const DB_PATH = process.env.DB_PATH || './data/admissions.db';

export async function initDatabase() {
  // Ensure data directory exists
  mkdirSync(dirname(DB_PATH), { recursive: true });

  const db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      display_name TEXT,
      email TEXT,
      azure_id TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS steps (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      sort_order INTEGER NOT NULL,
      deadline TEXT
    );

    CREATE TABLE IF NOT EXISTS student_progress (
      student_id TEXT NOT NULL,
      step_id INTEGER NOT NULL,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (student_id, step_id),
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (step_id) REFERENCES steps(id)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      changed_by TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
  `);

  // Migrations — add new columns (safe to re-run)
  const migrations = [
    'ALTER TABLE steps ADD COLUMN guide_content TEXT',
    'ALTER TABLE steps ADD COLUMN links TEXT',
    'ALTER TABLE steps ADD COLUMN required_tags TEXT',
    "ALTER TABLE steps ADD COLUMN required_tag_mode TEXT DEFAULT 'any'",
    'ALTER TABLE steps ADD COLUMN excluded_tags TEXT',
    'ALTER TABLE steps ADD COLUMN is_active INTEGER DEFAULT 1',
    'ALTER TABLE students ADD COLUMN tags TEXT',
    'ALTER TABLE students ADD COLUMN emplid TEXT',
    'ALTER TABLE students ADD COLUMN preferred_name TEXT',
    'ALTER TABLE students ADD COLUMN phone TEXT',
    'ALTER TABLE students ADD COLUMN applicant_type TEXT',
    'ALTER TABLE students ADD COLUMN major TEXT',
    'ALTER TABLE students ADD COLUMN residency TEXT',
    'ALTER TABLE students ADD COLUMN admit_term TEXT',
    'ALTER TABLE students ADD COLUMN last_synced_at DATETIME',
    "ALTER TABLE student_progress ADD COLUMN status TEXT DEFAULT 'completed'",
    'ALTER TABLE student_progress ADD COLUMN note TEXT',
    'ALTER TABLE steps ADD COLUMN contact_info TEXT',
    'ALTER TABLE steps ADD COLUMN term_id INTEGER',
    'ALTER TABLE steps ADD COLUMN deadline_date TEXT',
    'ALTER TABLE students ADD COLUMN term_id INTEGER',
    'ALTER TABLE steps ADD COLUMN is_public INTEGER DEFAULT 0',
    'ALTER TABLE steps ADD COLUMN step_key TEXT',
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }

  // Create terms table
  db.exec(`
    CREATE TABLE IF NOT EXISTS terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Backfill legacy rows after terms exist.
  const latestTerm = db.prepare('SELECT id FROM terms ORDER BY id DESC LIMIT 1').get();
  if (latestTerm?.id) {
    db.prepare('UPDATE steps SET term_id = ? WHERE term_id IS NULL').run(latestTerm.id);
    db.prepare('UPDATE students SET term_id = ? WHERE term_id IS NULL').run(latestTerm.id);
  }

  // Seed default term if empty and backfill existing data
  const termCount = db.prepare('SELECT COUNT(*) as count FROM terms').get();
  if (termCount.count === 0) {
    db.prepare(
      "INSERT INTO terms (name, start_date, end_date, is_active) VALUES ('Fall 2026', '2026-08-01', '2026-12-31', 1)"
    ).run();
    db.prepare('UPDATE steps SET term_id = 1 WHERE term_id IS NULL').run();
    db.prepare('UPDATE students SET term_id = 1 WHERE term_id IS NULL').run();
    console.log('Seeded default term: Fall 2026');
  }

  // Create admin_users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      display_name TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS integration_clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      key_hash TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS integration_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      integration_client_id INTEGER NOT NULL,
      source_event_id TEXT NOT NULL,
      student_id_number TEXT,
      step_key TEXT,
      request_body TEXT,
      response_status INTEGER NOT NULL,
      response_body TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (integration_client_id) REFERENCES integration_clients(id)
    );
  `);

  // Seed default superadmin if empty
  const adminCount = db.prepare('SELECT COUNT(*) as count FROM admin_users').get();
  if (adminCount.count === 0) {
    const bcrypt = await import('bcrypt');
    const email = process.env.ADMIN_DEFAULT_EMAIL || 'admin@csub.edu';
    const password = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123';
    const hash = await bcrypt.hash(password, 10);
    db.prepare(
      'INSERT INTO admin_users (email, password_hash, role, display_name) VALUES (?, ?, ?, ?)'
    ).run(email, hash, 'sysadmin', 'Admin');
    console.log(`Seeded default sysadmin: ${email}`);
  }

  // Seed default integration client in dev or when explicitly configured.
  const integrationCount = db.prepare('SELECT COUNT(*) as count FROM integration_clients').get();
  if (integrationCount.count === 0 && (process.env.NODE_ENV !== 'production' || process.env.INTEGRATION_DEFAULT_KEY)) {
    const bcrypt = await import('bcrypt');
    const clientName = process.env.INTEGRATION_DEFAULT_NAME || 'PeopleSoft Dev';
    const clientKey = process.env.INTEGRATION_DEFAULT_KEY || 'dev-integration-key';
    const keyHash = await bcrypt.hash(clientKey, 10);
    db.prepare(
      'INSERT INTO integration_clients (name, key_hash, is_active) VALUES (?, ?, 1)'
    ).run(clientName, keyHash);

    if (process.env.NODE_ENV !== 'production' && !process.env.INTEGRATION_DEFAULT_KEY) {
      console.log(`Seeded default integration client "${clientName}" with key: ${clientKey}`);
    } else {
      console.log(`Seeded default integration client "${clientName}"`);
    }
  }

  // Seed default steps if empty
  const count = db.prepare('SELECT COUNT(*) as count FROM steps').get();
  if (count.count === 0) {
    // Get the default term id for seeding
    const defaultTerm = db.prepare('SELECT id FROM terms WHERE is_active = 1 ORDER BY id LIMIT 1').get();
    const seedTermId = defaultTerm?.id || null;

    const insert = db.prepare(
      'INSERT INTO steps (id, title, description, icon, sort_order, deadline, term_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    const steps = [
      [1, 'Accepted!', 'Congratulations! You have been accepted to CSUB! This is the start of your Roadrunner journey.', '🎉', 1, null, seedTermId],
      [2, 'Activate Your CSUB Account', 'Set up your myCSUB portal access and create your student login credentials.', '💻', 2, null, seedTermId],
      [3, 'Submit Intent to Enroll', 'Confirm your spot at CSUB by submitting your Statement of Intent to Register.', '📋', 3, 'May 1', seedTermId],
      [4, 'Sign Into Your CSUB Email', 'Access your official @csub.edu email account for important university communications.', '📧', 4, null, seedTermId],
      [5, 'Register for Orientation', 'Sign up for a New Student Orientation session happening in May or June.', '📝', 5, 'May - June', seedTermId],
      [6, 'Attend Orientation', 'Learn about campus resources, meet fellow Runners, and get ready for your first semester!', '🎓', 6, 'July - August', seedTermId],
      [7, 'Meet with Your Advisor', 'Plan your first semester courses with your academic advisor.', '🤝', 7, null, seedTermId],
      [8, 'Move into Campus Housing', 'Get settled into your new home on the CSUB campus!', '🏠', 8, 'August', seedTermId],
      [9, 'First Day of Classes!', 'You made it! Welcome to CSUB, Runner! Time to hit the ground running!', '🏫', 9, null, seedTermId],
    ];

    const insertMany = db.transaction((rows) => {
      for (const row of rows) insert.run(...row);
    });

    insertMany(steps);
    // Mark first 2 steps as publicly visible (before login)
    db.prepare('UPDATE steps SET is_public = 1 WHERE sort_order <= 2').run();
    console.log('Seeded 9 admissions steps');
  }

  ensureStepKeys(db);

  try {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_students_emplid_unique
      ON students (lower(trim(emplid)))
      WHERE emplid IS NOT NULL AND trim(emplid) <> '';
    `);
  } catch (error) {
    console.warn('[db-init] Unable to create unique Student ID # index:', error.message);
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_steps_term_step_key_unique
    ON steps (term_id, step_key)
    WHERE term_id IS NOT NULL AND step_key IS NOT NULL AND trim(step_key) <> '';

    CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_events_unique
    ON integration_events (integration_client_id, source_event_id);

    CREATE INDEX IF NOT EXISTS idx_steps_step_key_lookup
    ON steps (term_id, step_key);
  `);

  // Seed 50 sample students if empty
  const studentCount = db.prepare('SELECT COUNT(*) as count FROM students').get();
  if (studentCount.count === 0) {
    const defaultTerm = db.prepare('SELECT id FROM terms WHERE is_active = 1 ORDER BY id LIMIT 1').get();
    const termId = defaultTerm?.id || 1;
    const stepRows = db.prepare('SELECT id, sort_order FROM steps WHERE term_id = ? ORDER BY sort_order').all(termId);

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
      'Business Administration',
      'Computer Science',
      'Psychology',
      'Nursing',
      'Mechanical Engineering',
      'Biology',
      'Criminal Justice',
      'Kinesiology',
      'Sociology',
      'Liberal Studies',
    ];
    const residencies = ['In-State', 'In-State', 'In-State', 'Out-of-State'];
    const manualTagOptions = [
      ['first-gen'],
      ['honors'],
      ['eop'],
      ['athlete'],
      ['veteran'],
      ['first-gen', 'honors'],
      [],
      [],
    ];

    const insertStudent = db.prepare(
      `INSERT INTO students (
        id, display_name, email, azure_id, tags, term_id, created_at, emplid,
        preferred_name, phone, applicant_type, major, residency, admit_term, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertProgress = db.prepare(
      'INSERT INTO student_progress (student_id, step_id, completed_at, status) VALUES (?, ?, ?, ?)'
    );

    // Progression profiles — how far along each student is (realistic distribution)
    // Most students cluster in the middle steps; a few are very early or fully done
    const progressionWeights = [
      { stepsCompleted: 0, weight: 2 },   // just accepted, haven't started
      { stepsCompleted: 1, weight: 3 },
      { stepsCompleted: 2, weight: 5 },   // activated account
      { stepsCompleted: 3, weight: 6 },   // submitted intent
      { stepsCompleted: 4, weight: 7 },   // signed into email
      { stepsCompleted: 5, weight: 8 },   // registered for orientation
      { stepsCompleted: 6, weight: 7 },   // attended orientation
      { stepsCompleted: 7, weight: 5 },   // met advisor
      { stepsCompleted: 8, weight: 4 },   // moved in
      { stepsCompleted: 9, weight: 3 },   // all done
    ];

    // Build weighted array
    const progressionPool = [];
    for (const p of progressionWeights) {
      for (let i = 0; i < p.weight; i++) {
        progressionPool.push(p.stepsCompleted);
      }
    }

    const seedStudents = db.transaction(() => {
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

        // Stagger created_at dates over the last 60 days
        const daysAgo = Math.floor(Math.random() * 60) + 1;
        const createdAt = new Date(Date.now() - daysAgo * 86400000).toISOString();

        insertStudent.run(
          id,
          name,
          email,
          azureId,
          manualTags.length > 0 ? JSON.stringify(manualTags) : null,
          termId,
          createdAt,
          emplid,
          preferredName,
          phone,
          applicantType,
          major,
          residency,
          admitTerm,
          lastSyncedAt
        );

        // Assign progress based on weighted profile
        const stepsCompleted = progressionPool[i % progressionPool.length];
        const completableSteps = stepRows.slice(0, stepsCompleted);

        for (let j = 0; j < completableSteps.length; j++) {
          const step = completableSteps[j];
          // Completion dates spread out: earlier steps completed earlier
          const completionDaysAgo = daysAgo - j * 2 - Math.floor(Math.random() * 3);
          const completedAt = new Date(Date.now() - Math.max(completionDaysAgo, 1) * 86400000).toISOString();

          // ~5% chance a step is waived instead of completed
          const status = (Math.random() < 0.05) ? 'waived' : 'completed';
          insertProgress.run(id, step.id, completedAt, status);
        }
      }
    });

    seedStudents();
    console.log('Seeded 50 sample students with realistic progress');
  }

  return db;
}
