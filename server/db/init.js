import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

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
    'ALTER TABLE steps ADD COLUMN is_active INTEGER DEFAULT 1',
    'ALTER TABLE students ADD COLUMN tags TEXT',
    "ALTER TABLE student_progress ADD COLUMN status TEXT DEFAULT 'completed'",
    'ALTER TABLE student_progress ADD COLUMN note TEXT',
    'ALTER TABLE steps ADD COLUMN contact_info TEXT',
    'ALTER TABLE steps ADD COLUMN term_id INTEGER',
    'ALTER TABLE steps ADD COLUMN deadline_date TEXT',
    'ALTER TABLE students ADD COLUMN term_id INTEGER',
    'ALTER TABLE steps ADD COLUMN is_public INTEGER DEFAULT 0',
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

  return db;
}
