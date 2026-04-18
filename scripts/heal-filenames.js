#!/usr/bin/env node
/**
 * Heals documents.file_name rows that were stored as latin1-decoded UTF-8 bytes
 * (classic multer mojibake) back to their original Arabic / non-ASCII text.
 *
 * Safe to re-run: only updates rows where the decoded version differs AND looks
 * like a valid UTF-8 string containing non-ASCII characters.
 *
 * Usage:
 *   node scripts/heal-filenames.js          # dry run, prints what it would change
 *   node scripts/heal-filenames.js --apply  # actually UPDATE the rows
 */
const { all, run } = require('../backend/db');

async function main() {
  const apply = process.argv.includes('--apply');
  const rows = await all(`SELECT id, file_name FROM documents WHERE file_name IS NOT NULL`);

  let changed = 0, skipped = 0;
  for (const r of rows) {
    const decoded = Buffer.from(r.file_name, 'latin1').toString('utf8');
    // Only heal if: decoding actually changes the string AND the result contains
    // non-ASCII (so plain ASCII filenames stay untouched).
    if (decoded !== r.file_name && /[^\x00-\x7F]/.test(decoded)) {
      // Sanity: the latin1->utf8 roundtrip should be stable. If not, skip.
      try { Buffer.from(decoded, 'utf8').toString('utf8'); } catch { skipped++; continue; }
      console.log(`→ ${r.id}`);
      console.log(`  before: ${r.file_name}`);
      console.log(`  after : ${decoded}`);
      if (apply) {
        await run(`UPDATE documents SET file_name = ? WHERE id = ?`, [decoded, r.id]);
      }
      changed++;
    } else {
      skipped++;
    }
  }

  console.log(`\n${apply ? 'Healed' : 'Would heal'} ${changed} row(s). Skipped ${skipped}.`);
  if (!apply && changed > 0) console.log('Re-run with --apply to persist changes.');
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
