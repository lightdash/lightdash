import { createHash } from 'crypto';
import { Knex } from 'knex';

export const classification: { kind: 'safe' | 'breaking'; reason: string } = {
    kind: 'safe',
    reason: 'Recomputes a bookkeeping hash column in place. No schema change, no user-visible content change, and re-running produces the same result.',
};

// Batched loop, so each statement runs in its own transaction.
export const config = { transaction: false };

const TABLE_NAME = 'content_as_code_snapshots';
const BATCH_SIZE = 500;

type SnapshotRow = {
    content_as_code_snapshot_uuid: string;
    snapshot: object;
};

// Frozen copy of the canonicalizer in
// services/CoderService/contentAsCodeSnapshot.ts: absent, null and empty all
// collapse to absent, keys are sorted, dates are ISO strings. Stored snapshots
// were hashed before empty values collapsed, so their hashes no longer match
// the hash the instance computes for the same document and every upload would
// read as drifted.
const canonicalize = (value: unknown): unknown => {
    if (value === null || value === undefined) return undefined;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) {
        const items = value
            .map(canonicalize)
            .filter((item) => item !== undefined);
        return items.length === 0 ? undefined : items;
    }
    if (typeof value === 'object') {
        const entries = Object.keys(value)
            .sort()
            .reduce<Record<string, unknown>>((acc, key) => {
                const child = canonicalize(
                    (value as Record<string, unknown>)[key],
                );
                if (child !== undefined) {
                    acc[key] = child;
                }
                return acc;
            }, {});
        return Object.keys(entries).length === 0 ? undefined : entries;
    }
    return value;
};

export async function up(knex: Knex): Promise<void> {
    const hasTable = await knex.schema.hasTable(TABLE_NAME);
    if (!hasTable) return;

    await knex.raw('SET statement_timeout = 0');
    try {
        let cursor: string | undefined;
        let updated = 0;
        for (;;) {
            const query = knex(TABLE_NAME)
                .select('content_as_code_snapshot_uuid', 'snapshot')
                .orderBy('content_as_code_snapshot_uuid')
                .limit(BATCH_SIZE);
            if (cursor !== undefined) {
                query.where('content_as_code_snapshot_uuid', '>', cursor);
            }
            // eslint-disable-next-line no-await-in-loop
            const rows: SnapshotRow[] = await query;
            if (rows.length === 0) break;

            // eslint-disable-next-line no-await-in-loop
            await Promise.all(
                rows.map((row) => {
                    const snapshot = canonicalize(row.snapshot) ?? {};
                    const snapshotHash = createHash('sha256')
                        .update(JSON.stringify(snapshot))
                        .digest('hex');
                    return knex.raw(
                        `UPDATE ?? SET snapshot = ?::jsonb, snapshot_hash = ?
                         WHERE content_as_code_snapshot_uuid = ?`,
                        [
                            TABLE_NAME,
                            JSON.stringify(snapshot),
                            snapshotHash,
                            row.content_as_code_snapshot_uuid,
                        ],
                    );
                }),
            );

            updated += rows.length;
            cursor = rows[rows.length - 1].content_as_code_snapshot_uuid;
            console.log(
                `Recomputed ${updated} content_as_code_snapshots hashes`,
            );
        }
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(): Promise<void> {
    // The normalization drops null and empty values, so the pre-migration
    // hashes cannot be derived from the rewritten snapshots. A rollback leaves
    // uploads reading content as ahead of the recorded baseline, which skips
    // rather than overwrites.
    throw new Error(
        'irreversible: content-as-code snapshot hashes are recomputed in place and the pre-normalization values are not recoverable',
    );
}
