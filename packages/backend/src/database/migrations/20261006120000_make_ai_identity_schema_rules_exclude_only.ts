import { Knex } from 'knex';
import { z } from 'zod';

export const classification: { kind: 'safe' | 'breaking'; reason: string } = {
    kind: 'safe',
    reason: 'Rewrites unreleased AI role rules and preserves the schemas column read by released application versions. Unsupported legacy rules grant no schemas.',
};

const currentSchemaRule = z
    .object({
        database: z.string(),
        excludePatterns: z.array(z.string()),
    })
    .strict();

const legacySchemaRule = z.discriminatedUnion('mode', [
    z.object({
        mode: z.literal('all_except'),
        database: z.string(),
        patterns: z.array(z.string()),
    }),
    z.object({
        mode: z.literal('only_matching'),
        database: z.string(),
        patterns: z.array(z.string()),
    }),
    z.object({ mode: z.literal('list'), schemas: z.array(z.string()) }),
    z.object({ mode: z.literal('existing_role') }),
]);

const assertUnreachable = (value: never, message: string): never => {
    throw new Error(`${message}: ${value}`);
};

export const normalizeStoredSchemaRule = (
    rule: unknown,
    schemas: string[],
): { database: string; excludePatterns: string[] } => {
    if (rule === null)
        return {
            database: schemas[0]?.split('.')[0] ?? '',
            excludePatterns: ['*'],
        };
    const current = currentSchemaRule.safeParse(rule);
    if (current.success) return current.data;
    const legacy = legacySchemaRule.parse(rule);
    switch (legacy.mode) {
        case 'all_except':
            return {
                database: legacy.database,
                excludePatterns: legacy.patterns,
            };
        case 'list':
            return {
                database: legacy.schemas[0]?.split('.')[0] ?? '',
                excludePatterns: ['*'],
            };
        case 'only_matching':
        case 'existing_role':
            return {
                database: schemas[0]?.split('.')[0] ?? '',
                excludePatterns: ['*'],
            };
        default:
            return assertUnreachable(legacy, 'Unknown stored schema rule');
    }
};

export async function up(knex: Knex): Promise<void> {
    const rows = await knex<{
        ai_identity_ai_role_uuid: string;
        schemas: string[];
        schema_rule: unknown;
    }>('ai_identity_ai_roles').select(
        'ai_identity_ai_role_uuid',
        'schemas',
        'schema_rule',
    );
    await Promise.all(
        rows.map((row) =>
            knex('ai_identity_ai_roles')
                .where({
                    ai_identity_ai_role_uuid: row.ai_identity_ai_role_uuid,
                })
                .update({
                    schema_rule: JSON.stringify(
                        normalizeStoredSchemaRule(row.schema_rule, row.schemas),
                    ),
                }),
        ),
    );
}

export async function down(): Promise<void> {
    throw new Error(
        'irreversible: legacy schema rule modes cannot be restored after conversion.',
    );
}
