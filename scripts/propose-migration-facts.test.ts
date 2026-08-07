import { type MigrationFact } from '@lightdash/common';
import * as assert from 'assert';
import { validateMigrationFactProposal } from './propose-migration-facts';

const structuralFact: MigrationFact = {
    migration: '20260807000000_backfill_widgets',
    introducedIn: '1.100.0',
    runsInTransaction: false,
    resumable: true,
    batchSize: 1000,
    lockTimeout: '5s',
    tables: [
        {
            name: 'widgets',
            access: ['write'],
            expectedLockModes: ['RowExclusiveLock'],
        },
        {
            name: 'owners',
            access: ['read'],
            expectedLockModes: ['AccessShareLock'],
        },
    ],
    backfill: null,
    notes: null,
};

function response(
    overrides: Partial<MigrationFact> = {},
    backfillOverrides: Record<string, unknown> = {},
): string {
    return JSON.stringify({
        ...structuralFact,
        ...overrides,
        backfill: {
            description: 'Populate widget owners',
            estimateSql:
                'SELECT widgets.widget_id, owners.owner_id FROM widgets JOIN owners ON owners.owner_id = widgets.owner_id WHERE widgets.ready = false',
            planSql:
                'SELECT widgets.widget_id, owners.owner_id FROM widgets JOIN owners ON owners.owner_id = widgets.owner_id WHERE widgets.ready = false LIMIT 1000',
            supportingIndexSql: null,
            ...backfillOverrides,
        },
    });
}

const valid = validateMigrationFactProposal(response(), structuralFact);
assert.deepStrictEqual(valid, {
    backfill: {
        description: 'Populate widget owners',
        estimateSql:
            'SELECT widgets.widget_id, owners.owner_id FROM widgets JOIN owners ON owners.owner_id = widgets.owner_id WHERE widgets.ready = false',
        planSql:
            'SELECT widgets.widget_id, owners.owner_id FROM widgets JOIN owners ON owners.owner_id = widgets.owner_id WHERE widgets.ready = false LIMIT 1000',
        supportingIndexSql: null,
    },
    rejectionReason: null,
});

for (const mutation of [
    {
        tables: [
            {
                name: 'other_widgets',
                access: ['write'],
                expectedLockModes: ['RowExclusiveLock'],
            },
        ],
    },
    { batchSize: 500 },
]) {
    const result = validateMigrationFactProposal(
        response(mutation as Partial<MigrationFact>),
        structuralFact,
    );
    assert.strictEqual(result.backfill, null);
    assert.strictEqual(
        result.rejectionReason,
        'model mutated structural fields',
    );
}

for (const sql of [
    'UPDATE widgets SET ready = true',
    'DELETE FROM widgets',
    'INSERT INTO widgets(widget_id) VALUES (1)',
    'SELECT widget_id FROM widgets; SELECT owner_id FROM owners',
    'WITH changed AS (UPDATE widgets SET ready = true RETURNING widget_id) SELECT widget_id FROM changed',
    'SELECT widget_id FROM widgets FOR UPDATE',
]) {
    const result = validateMigrationFactProposal(
        response({}, { estimateSql: sql }),
        structuralFact,
    );
    assert.strictEqual(result.backfill, null);
    assert.match(
        result.rejectionReason ?? '',
        /estimateSql rejected:|must be a single statement/,
    );
}

const writingPlan = validateMigrationFactProposal(
    response({}, { planSql: 'DELETE FROM owners' }),
    structuralFact,
);
assert.strictEqual(writingPlan.backfill, null);
assert.match(writingPlan.rejectionReason ?? '', /^planSql rejected:/);

const missingBatchPlan = validateMigrationFactProposal(
    response({}, { planSql: null }),
    structuralFact,
);
assert.strictEqual(missingBatchPlan.backfill, null);
assert.strictEqual(
    missingBatchPlan.rejectionReason,
    'batched migration requires a separate planSql',
);

const unexpectedBackfillField = validateMigrationFactProposal(
    response({}, { perPassCost: 'remaining' }),
    structuralFact,
);
assert.strictEqual(unexpectedBackfillField.backfill, null);
assert.strictEqual(
    unexpectedBackfillField.rejectionReason,
    'model returned unexpected backfill fields',
);

const nonConcurrentIndex = validateMigrationFactProposal(
    response(
        {},
        {
            supportingIndexSql:
                'CREATE INDEX widgets_ready_idx ON widgets (widget_id) WHERE ready = false',
        },
    ),
    structuralFact,
);
assert.strictEqual(nonConcurrentIndex.backfill, null);
assert.match(
    nonConcurrentIndex.rejectionReason ?? '',
    /CREATE \[UNIQUE\] INDEX CONCURRENTLY/,
);

for (const malformed of [
    '{"migration":"truncated"',
    'I cannot provide JSON for this migration.',
]) {
    const result = validateMigrationFactProposal(malformed, structuralFact);
    assert.strictEqual(result.backfill, null);
    assert.strictEqual(result.rejectionReason, 'could not parse final JSON');
}

const fenced = validateMigrationFactProposal(
    `\`\`\`json\n${response()}\n\`\`\``,
    structuralFact,
);
assert.notStrictEqual(fenced.backfill, null);

console.log('propose-migration-facts: tests passed');
