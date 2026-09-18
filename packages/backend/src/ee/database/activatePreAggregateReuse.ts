import { Knex } from 'knex';

/**
 * The contract half of the phased rollout. Deliberately outside the automatic
 * migration directory: deploy the compatibility release to every API, scheduler,
 * and query worker before invoking this through the approved deployment path.
 * Older binaries must never run or automatically roll the schema back afterward.
 */
export async function activatePreAggregateReuse(
    knex: Knex,
    args: { compatibleWritersConfirmed: true; actor: string },
): Promise<void> {
    if (!args.compatibleWritersConfirmed || !args.actor.trim()) {
        throw new Error(
            'Activation requires an attributed confirmation that every writer supports the registry schema',
        );
    }
    const state = await knex('pre_aggregate_reuse_state')
        .where('state_key', 'singleton')
        .first<{ phase: string }>();
    if (!state)
        throw new Error('Apply the pre-aggregate reuse expand migration first');

    await knex.raw('SET statement_timeout = 0');
    await knex.raw("SET lock_timeout = '5s'");
    try {
        for (;;) {
            // Compatibility writers populate these fields, but older writers
            // may have created a final tail after the expand migration backfill.
            // eslint-disable-next-line no-await-in-loop
            const result = await knex.raw<{ rowCount: number }>(`
                WITH batch AS (
                    SELECT d.pre_aggregate_definition_uuid, ce.name,
                           d.pre_aggregate_definition->>'name' AS definition_name,
                           p.scheduler_timezone, p.project_type
                    FROM pre_aggregate_definitions d
                    JOIN cached_explore ce ON ce.cached_explore_uuid = d.source_cached_explore_uuid
                    JOIN projects p ON p.project_uuid = d.project_uuid
                    WHERE (d.source_explore_name IS NULL OR d.pre_aggregate_name IS NULL
                        OR d.publication_version IS NULL OR d.schedule_revision IS NULL)
                        AND d.pre_aggregate_definition->>'name' IS NOT NULL
                    LIMIT 1000
                )
                UPDATE pre_aggregate_definitions d
                SET source_explore_name = COALESCE(d.source_explore_name, batch.name),
                    pre_aggregate_name = COALESCE(d.pre_aggregate_name, batch.definition_name),
                    publication_version = COALESCE(d.publication_version, uuid_generate_v4()),
                    schedule_revision = COALESCE(d.schedule_revision, uuid_generate_v4()),
                    scheduler_timezone = COALESCE(d.scheduler_timezone, batch.scheduler_timezone),
                    automatic_eligible = batch.project_type <> 'PREVIEW'
                        AND d.pre_aggregate_definition->>'table' IS NULL
                        AND d.materialization_metric_query IS NOT NULL
                        AND d.materialization_query_error IS NULL,
                    preparation_status = CASE WHEN d.materialization_query_error IS NULL THEN 'unverified' ELSE 'invalid' END
                FROM batch WHERE d.pre_aggregate_definition_uuid = batch.pre_aggregate_definition_uuid
            `);
            if (result.rowCount === 0) break;
        }

        console.log(
            `Pre-aggregate reuse activation: validating logical names (actor: ${args.actor})`,
        );
        const invalid = await knex('pre_aggregate_definitions')
            .whereNull('source_explore_name')
            .orWhereNull('pre_aggregate_name')
            .first();
        if (invalid)
            throw new Error(
                'Cannot activate pre-aggregate reuse: a definition has no recoverable logical identity',
            );

        for (const column of ['source_explore_name', 'pre_aggregate_name']) {
            const constraintName = `pre_aggregate_reuse_${column}_required`;
            // eslint-disable-next-line no-await-in-loop
            const constraint = await knex.raw<{ rows: { conname: string }[] }>(
                `SELECT conname FROM pg_constraint WHERE conrelid = 'pre_aggregate_definitions'::regclass AND conname = ?`,
                [constraintName],
            );
            if (constraint.rows.length === 0) {
                // eslint-disable-next-line no-await-in-loop
                await knex.raw(
                    'ALTER TABLE pre_aggregate_definitions ADD CONSTRAINT ?? CHECK (?? IS NOT NULL) NOT VALID',
                    [constraintName, column],
                );
            }
            // eslint-disable-next-line no-await-in-loop
            await knex.raw(
                'ALTER TABLE pre_aggregate_definitions VALIDATE CONSTRAINT ??',
                [constraintName],
            );
        }

        console.log(
            `Pre-aggregate reuse activation: switching cache references and enabling reuse (actor: ${args.actor})`,
        );
        await knex.transaction(async (trx) => {
            await trx.raw("SET LOCAL lock_timeout = '5s'");
            const lockedState = await trx('pre_aggregate_reuse_state')
                .where('state_key', 'singleton')
                .forUpdate()
                .first<{ phase: string }>();
            if (lockedState?.phase === 'active') return;
            // Atomic with the state switch: no reader observes detached cache
            // rows while still using legacy serving/promotion rules.
            await trx.raw(
                'LOCK TABLE pre_aggregate_definitions IN ACCESS EXCLUSIVE MODE',
            );
            const cacheForeignKeys = await trx.raw<{
                rows: { conname: string }[];
            }>(`
                SELECT DISTINCT c.conname FROM pg_constraint c
                JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
                WHERE c.conrelid = 'pre_aggregate_definitions'::regclass AND c.contype = 'f'
                  AND a.attname IN ('source_cached_explore_uuid', 'pre_agg_cached_explore_uuid')
            `);
            for (const constraint of cacheForeignKeys.rows) {
                // eslint-disable-next-line no-await-in-loop
                await trx.raw(
                    'ALTER TABLE pre_aggregate_definitions DROP CONSTRAINT ??',
                    [constraint.conname],
                );
            }
            await trx.raw(`
                ALTER TABLE pre_aggregate_definitions
                    ALTER COLUMN source_explore_name SET NOT NULL,
                    ALTER COLUMN pre_aggregate_name SET NOT NULL,
                    ALTER COLUMN source_cached_explore_uuid DROP NOT NULL,
                    ALTER COLUMN pre_agg_cached_explore_uuid DROP NOT NULL,
                    ADD CONSTRAINT pre_aggregate_reuse_source_cache_fk FOREIGN KEY (source_cached_explore_uuid)
                        REFERENCES cached_explore(cached_explore_uuid) ON DELETE SET NULL NOT VALID,
                    ADD CONSTRAINT pre_aggregate_reuse_generated_cache_fk FOREIGN KEY (pre_agg_cached_explore_uuid)
                        REFERENCES cached_explore(cached_explore_uuid) ON DELETE SET NULL NOT VALID
            `);
            await trx('pre_aggregate_reuse_state')
                .where('state_key', 'singleton')
                .update({
                    phase: 'active',
                    reuse_enabled: true,
                    reuse_updated_by: args.actor,
                    activated_by: args.actor,
                    updated_at: new Date(),
                });
        });
        // Existing rows were already protected by the previous foreign keys;
        // validation can run without holding the publication lock.
        await knex.raw(
            'ALTER TABLE pre_aggregate_definitions VALIDATE CONSTRAINT pre_aggregate_reuse_source_cache_fk',
        );
        await knex.raw(
            'ALTER TABLE pre_aggregate_definitions VALIDATE CONSTRAINT pre_aggregate_reuse_generated_cache_fk',
        );
        await knex.raw(
            'ALTER TABLE pre_aggregate_definitions DROP CONSTRAINT IF EXISTS pre_aggregate_reuse_source_explore_name_required',
        );
        await knex.raw(
            'ALTER TABLE pre_aggregate_definitions DROP CONSTRAINT IF EXISTS pre_aggregate_reuse_pre_aggregate_name_required',
        );
    } finally {
        await knex.raw('RESET lock_timeout');
        await knex.raw('RESET statement_timeout');
    }
}

/** Disable deployment reuse without weakening the activated schema's serving
 * and promotion guards. Schema rollback to the compatibility phase is forbidden. */
export async function setPreAggregateReuseEnabled(
    knex: Knex,
    args: { enabled: boolean; actor: string },
): Promise<void> {
    if (!args.actor.trim())
        throw new Error('Changing reuse requires an attributed operator');
    await knex.transaction(async (trx) => {
        const state = await trx('pre_aggregate_reuse_state')
            .where('state_key', 'singleton')
            .forUpdate()
            .first();
        if (!state || state.phase !== 'active')
            throw new Error(
                'Activate the registry schema before changing deployment reuse',
            );
        await trx('pre_aggregate_reuse_state')
            .where('state_key', 'singleton')
            .update({
                reuse_enabled: args.enabled,
                reuse_updated_by: args.actor,
                updated_at: new Date(),
            });
    });
    console.log(
        `Pre-aggregate deployment reuse ${args.enabled ? 'enabled' : 'disabled'} (actor: ${args.actor})`,
    );
}
