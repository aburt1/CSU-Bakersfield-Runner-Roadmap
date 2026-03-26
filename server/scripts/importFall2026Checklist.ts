import dotenv from 'dotenv';
import { initDatabase } from '../db/init.js';
import { importFall2026Checklist } from '../utils/onboardingChecklistImport.js';

dotenv.config();

function getArgValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index === process.argv.length - 1) return null;
  return process.argv[index + 1];
}

async function main(): Promise<void> {
  const db = await initDatabase();
  const termIdArg = getArgValue('--term-id');
  const termNameArg = getArgValue('--term-name');

  let term: { id: number; name: string } | null = null;
  if (termIdArg) {
    term = await db.queryOne<{ id: number; name: string }>('SELECT id, name FROM terms WHERE id = $1', [parseInt(termIdArg, 10)]);
  } else if (termNameArg) {
    term = await db.queryOne<{ id: number; name: string }>('SELECT id, name FROM terms WHERE name = $1', [termNameArg]);
  } else {
    term = await db.queryOne<{ id: number; name: string }>('SELECT id, name FROM terms WHERE name = $1', ['Fall 2026'])
      || await db.queryOne<{ id: number; name: string }>('SELECT id, name FROM terms WHERE is_active = 1 ORDER BY id DESC LIMIT 1');
  }

  if (!term) {
    throw new Error('No matching term found. Use --term-id or --term-name.');
  }

  const report = await importFall2026Checklist(db, term.id, { deactivateUnmatched: true });
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

  await db.end();
}

main().catch((error: unknown) => {
  console.error('[import-fall-2026-checklist]', error);
  process.exit(1);
});
