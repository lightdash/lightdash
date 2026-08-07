import type { MigrationFact } from '@lightdash/common';
import * as fs from 'fs';
import * as path from 'path';
import {
    deriveMigrationFact,
    migrationContainsBackfill,
} from './derive-migration-facts';
import { introducedInFromGit } from './gen-migration-facts';
import { parseFactsFile } from './preflight';
import { proposeMigrationFact } from './propose-migration-facts';
import {
    previousReleaseTag,
    verifyAgainstHistoricalSchema,
} from './verify-migration-facts';

const CORE_MIGRATIONS = 'packages/backend/src/database/migrations';
const CORPUS = path.join(__dirname, 'migration-facts.json');

interface Outcome {
    migration: string;
    introducedIn: string | null;
    previousTag: string | null;
    status: 'accepted' | 'rejected' | 'no-proposal' | 'error';
    detail: string;
}

function backfillMigrations(): string[] {
    return fs
        .readdirSync(CORE_MIGRATIONS)
        .filter((file) => /^\d{14}_.+\.ts$/.test(file))
        .sort()
        .filter((file) =>
            migrationContainsBackfill(
                fs.readFileSync(path.join(CORE_MIGRATIONS, file), 'utf-8'),
            ),
        )
        .map((file) => file.replace(/\.ts$/, ''));
}

async function main(): Promise<void> {
    const databaseUrl = process.argv.includes('--database-url')
        ? process.argv[process.argv.indexOf('--database-url') + 1]
        : null;
    const limit = process.argv.includes('--limit')
        ? Number(process.argv[process.argv.indexOf('--limit') + 1])
        : Number.POSITIVE_INFINITY;
    const outPath = process.argv.includes('--out')
        ? process.argv[process.argv.indexOf('--out') + 1]
        : null;
    const apiKey = process.env.ANTHROPIC_API_KEY;

    const existing = parseFactsFile(fs.readFileSync(CORPUS, 'utf-8'));
    const alreadyAuthored = new Set(
        existing.migrationFacts.map((fact) => fact.migration),
    );

    const candidates = backfillMigrations()
        .filter((name) => !alreadyAuthored.has(name))
        .slice(0, limit);
    console.log(
        `[backfill] ${candidates.length} backfill migration(s) without an authored fact`,
    );

    const outcomes: Outcome[] = [];
    const accepted: MigrationFact[] = [];

    for (const migration of candidates) {
        const migrationPath = path.join(CORE_MIGRATIONS, `${migration}.ts`);
        const introducedIn = introducedInFromGit(migrationPath);
        if (introducedIn === null) {
            outcomes.push({
                migration,
                introducedIn: null,
                previousTag: null,
                status: 'error',
                detail: 'not contained in any release tag',
            });
            continue;
        }
        let previousTag: string;
        try {
            previousTag = previousReleaseTag(introducedIn);
        } catch (error) {
            outcomes.push({
                migration,
                introducedIn,
                previousTag: null,
                status: 'error',
                detail: error instanceof Error ? error.message : String(error),
            });
            continue;
        }

        const structuralFact = deriveMigrationFact(
            fs.readFileSync(migrationPath, 'utf-8'),
            migration,
            introducedIn,
        );

        try {
            const fact = await proposeMigrationFact({
                apiKey,
                previousTag,
                migrationPath,
                structuralFact,
                verify: async (candidate) => {
                    const verdict = await verifyAgainstHistoricalSchema(
                        candidate,
                        previousTag,
                        databaseUrl,
                        30,
                    );
                    return verdict.ok
                        ? { ok: true }
                        : { ok: false, reason: `${verdict.reason}: ${verdict.message}` };
                },
            });
            if (fact === null || fact.backfill === null) {
                outcomes.push({
                    migration,
                    introducedIn,
                    previousTag,
                    status: fact === null ? 'no-proposal' : 'rejected',
                    detail: 'degraded to backfill: null',
                });
                console.log(`[backfill] ${migration}: no accepted SQL`);
                continue;
            }
            accepted.push(fact);
            outcomes.push({
                migration,
                introducedIn,
                previousTag,
                status: 'accepted',
                detail: `perPassCost=${fact.backfill.perPassCost ?? 'remaining'}`,
            });
            console.log(`[backfill] ${migration}: ACCEPTED (verified)`);
        } catch (error) {
            outcomes.push({
                migration,
                introducedIn,
                previousTag,
                status: 'error',
                detail: error instanceof Error ? error.message : String(error),
            });
            console.log(
                `[backfill] ${migration}: ERROR ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    const tally = (status: Outcome['status']): number =>
        outcomes.filter((outcome) => outcome.status === status).length;
    console.log(
        `[backfill] ${outcomes.length} attempted: ${tally('accepted')} accepted, ${tally('rejected')} rejected by verification, ${tally('no-proposal')} produced no proposal, ${tally('error')} errored`,
    );

    if (outPath !== null) {
        fs.writeFileSync(
            outPath,
            `${JSON.stringify({ outcomes, accepted }, null, 4)}\n`,
        );
        console.log(`[backfill] wrote ${outPath}`);
    }
}

main().catch((error) => {
    console.error(
        `[backfill] FAILED: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
});
