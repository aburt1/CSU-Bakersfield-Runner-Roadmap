import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

const DB_PATH = process.env.DB_PATH || './data/admissions.db';

export function initDatabase() {
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
  `);

  // Seed default steps if empty
  const count = db.prepare('SELECT COUNT(*) as count FROM steps').get();
  if (count.count === 0) {
    const insert = db.prepare(
      'INSERT INTO steps (id, title, description, icon, sort_order, deadline) VALUES (?, ?, ?, ?, ?, ?)'
    );

    const steps = [
      [1, 'Accepted!', 'Congratulations! You have been accepted to CSUB! This is the start of your Roadrunner journey.', '🎉', 1, null],
      [2, 'Activate Your CSUB Account', 'Set up your myCSUB portal access and create your student login credentials.', '💻', 2, null],
      [3, 'Submit Intent to Enroll', 'Confirm your spot at CSUB by submitting your Statement of Intent to Register.', '📋', 3, 'May 1'],
      [4, 'Sign Into Your CSUB Email', 'Access your official @csub.edu email account for important university communications.', '📧', 4, null],
      [5, 'Register for Orientation', 'Sign up for a New Student Orientation session happening in May or June.', '📝', 5, 'May - June'],
      [6, 'Attend Orientation', 'Learn about campus resources, meet fellow Runners, and get ready for your first semester!', '🎓', 6, 'July - August'],
      [7, 'Meet with Your Advisor', 'Plan your first semester courses with your academic advisor.', '🤝', 7, null],
      [8, 'Move into Campus Housing', 'Get settled into your new home on the CSUB campus!', '🏠', 8, 'August'],
      [9, 'First Day of Classes!', 'You made it! Welcome to CSUB, Runner! Time to hit the ground running!', '🏫', 9, null],
    ];

    const insertMany = db.transaction((rows) => {
      for (const row of rows) insert.run(...row);
    });

    insertMany(steps);
    console.log('Seeded 9 admissions steps');
  }

  return db;
}
