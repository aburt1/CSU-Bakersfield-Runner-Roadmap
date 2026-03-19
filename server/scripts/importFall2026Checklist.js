import dotenv from 'dotenv';
import { initDatabase } from '../db/init.js';
import { importFall2026Checklist } from '../utils/onboardingChecklistImport.js';

dotenv.config();

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index === process.argv.length - 1) return null;
  return process.argv[index + 1];
}

async function main() {
  const db = await initDatabase();
  const termIdArg = getArgValue('--term-id');
  const termNameArg = getArgValue('--term-name');

  let term = null;
  if (termIdArg) {
    term = db.prepare('SELECT id, name FROM terms WHERE id = ?').get(parseInt(termIdArg, 10));
  } else if (termNameArg) {
    term = db.prepare('SELECT id, name FROM terms WHERE name = ?').get(termNameArg);
  } else {
    term = db.prepare('SELECT id, name FROM terms WHERE name = ?').get('Fall 2026')
      || db.prepare('SELECT id, name FROM terms WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
  }

  if (!term) {
    throw new Error('No matching term found. Use --term-id or --term-name.');
  }

  const report = importFall2026Checklist(db, term.id, { deactivateUnmatched: true });
  console.log(`Imported Fall 2026 onboarding checklist into term "${term.name}" (${term.id})`);
  console.log(`Updated: ${report.updated.length}`);
  console.log(`Inserted: ${report.inserted.length}`);
  console.log(`Deactivated: ${report.deactivated.length}`);

  if (report.deactivated.length > 0) {
    console.log('Deactivated steps:');
    for (const item of report.deactivated) {
      console.log(`- ${item}`);
    }
  }
}

main().catch((error) => {
  console.error('[import-fall-2026-checklist]', error);
  process.exit(1);
});
