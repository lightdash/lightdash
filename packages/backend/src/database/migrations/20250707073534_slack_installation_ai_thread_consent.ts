import { Knex } from 'knex';
import { lightdashConfig } from '../../config/lightdashConfig';

const hasEnterpriseLicense = !!lightdashConfig.license.licenseKey;

const SlackAuthTokensTableName = 'slack_auth_tokens';

export async function up(knex: Knex): Promise<void> {
    const hasColumn = await knex.schema.hasColumn(
        SlackAuthTokensTableName,
        'ai_thread_access_consent',
    );
    if (hasColumn) {
        return;
    }

    await knex.schema.alterTable(SlackAuthTokensTableName, (table) => {
        table.boolean('ai_thread_access_consent').defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    const hasColumn = await knex.schema.hasColumn(
        SlackAuthTokensTableName,
        'ai_thread_access_consent',
    );
    if (!hasColumn) {
        return;
    }

    // We have a duplicated migration in EE, so we don't need to remove the column here if we're running EE
    if (hasEnterpriseLicense) {
        return;
    }

    await knex.schema.alterTable(SlackAuthTokensTableName, (table) => {
        table.dropColumn('ai_thread_access_consent');
    });
}
