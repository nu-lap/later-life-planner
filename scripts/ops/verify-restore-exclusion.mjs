#!/usr/bin/env node

import fs from 'node:fs';

function readJson(path) {
  try {
    const raw = fs.readFileSync(path, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown JSON read error.';
    throw new Error(`Failed to read JSON from ${path}: ${message}`);
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--restore') {
      args.restore = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === '--deleted') {
      args.deleted = argv[i + 1];
      i += 1;
      continue;
    }
  }
  if (!args.restore || !args.deleted) {
    throw new Error(
      'Usage: node scripts/ops/verify-restore-exclusion.mjs --restore <restore-candidates.json> --deleted <deletion-ledger.json>',
    );
  }
  return args;
}

function extractRestoreIds(restoreJson) {
  if (!Array.isArray(restoreJson)) {
    throw new Error('Restore file must be a JSON array.');
  }
  const ids = new Set();
  for (const row of restoreJson) {
    if (!row || typeof row !== 'object') continue;
    const candidate = row.id;
    if (typeof candidate === 'string' && candidate.length > 0) {
      ids.add(candidate);
    }
  }
  return ids;
}

function extractDeletedUserIds(deletedJson) {
  if (!Array.isArray(deletedJson)) {
    throw new Error('Deletion ledger must be a JSON array.');
  }
  const deleted = new Set();
  for (const row of deletedJson) {
    if (!row || typeof row !== 'object') continue;
    const candidate = row.userId;
    if (typeof candidate === 'string' && candidate.length > 0) {
      deleted.add(candidate);
    }
  }
  return deleted;
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const restoreJson = readJson(args.restore);
    const deletedJson = readJson(args.deleted);

    const restoreIds = extractRestoreIds(restoreJson);
    const deletedUserIds = extractDeletedUserIds(deletedJson);

    const overlaps = [...restoreIds].filter((id) => deletedUserIds.has(id)).sort();

    if (overlaps.length > 0) {
      console.error('Restore exclusion check FAILED.');
      console.error('Deleted users present in restore candidate set:');
      for (const id of overlaps) {
        console.error(`- ${id}`);
      }
      process.exit(1);
    }

    console.log('Restore exclusion check passed.');
    console.log(`Restore candidates: ${restoreIds.size}`);
    console.log(`Deleted users tracked: ${deletedUserIds.size}`);
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    console.error(message);
    process.exit(2);
  }
}

main();

