import { Knex } from 'knex';

// Flags removed from the FeatureFlags enum: their behaviour is now the
// default, so their rows only confuse Console operators.
const RETIRED_FLAG_IDS = [
    'change-chart-explore',
    'in-dashboard-chart-editor',
    'multi-dbt-sources',
    'ai-preview-deploy-setup',
    'ai-mcp-github-pat',
    'ai-deep-research',
];

export async function up(knex: Knex): Promise<void> {
    await knex('feature_flag_overrides')
        .whereIn('flag_id', RETIRED_FLAG_IDS)
        .delete();
    await knex('feature_flags').whereIn('flag_id', RETIRED_FLAG_IDS).delete();
}

export async function down(): Promise<void> {
    throw new Error(
        'irreversible: deleted feature flag rows cannot be recreated; the flags no longer exist in the application',
    );
}
