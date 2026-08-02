import { Knex } from 'knex';

// Intentional no-op. Announcement categories became an enum column
// (20260721170100), but the uuid FK and categories lookup table are still
// referenced by already-released code (0.3437.x), so dropping them here would
// break old pods during a rolling upgrade. The drops move to a follow-up
// migration once this release is out. Environments that ran an earlier
// version of this file (local dev, PR previews) have already dropped the
// now-inert objects — harmless divergence the follow-up's guards converge.
export async function up(_knex: Knex): Promise<void> {
    // no-op
}

export async function down(_knex: Knex): Promise<void> {
    // no-op
}
