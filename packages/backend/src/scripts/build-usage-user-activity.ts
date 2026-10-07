import { FeatureFlags } from '@lightdash/common';
import knex from 'knex';
import { parseArgs } from 'node:util';
import { usageProcessingStartDate } from '../analytics/eventStream/usageProcessingWindow';
import {
    UsageUserActivityBuilder,
    validateUserActivityRange,
} from '../analytics/eventStream/UsageUserActivityBuilder';
import { lightdashConfig } from '../config/lightdashConfig';
import { parseUsageEventsS3Config } from '../config/parseConfig';
import knexConfig from '../knexfile';
import { FeatureFlagModel } from '../models/FeatureFlagModel/FeatureFlagModel';

async function main() {
    const { values } = parseArgs({
        options: {
            'org-id': { type: 'string' },
            from: { type: 'string' },
            to: { type: 'string' },
            help: { type: 'boolean' },
        },
    });
    if (values.help) {
        console.log(
            'build-usage-user-activity --org-id UUID --from YYYY-MM-DD --to YYYY-MM-DD\nDerives user activity for all usage streams across the previous seven closed UTC days. Uses usage-events S3 configuration.',
        );
        return;
    }
    if (!values['org-id'] || !values.from || !values.to) {
        throw new Error(
            'Required arguments: --org-id UUID --from YYYY-MM-DD --to YYYY-MM-DD',
        );
    }
    validateUserActivityRange(values['org-id'], values.from, values.to);
    const storage = parseUsageEventsS3Config();
    if (!storage) throw new Error('Usage-events S3 storage is not configured');
    if (values.from < usageProcessingStartDate(new Date())) {
        throw new Error(
            'Usage processing is limited to the previous seven closed UTC days',
        );
    }
    const database = knex(knexConfig.production);
    try {
        const { enabled } = await new FeatureFlagModel({
            database,
            lightdashConfig,
        }).get({
            featureFlagId: FeatureFlags.AnalyticsProject,
            user: { organizationUuid: values['org-id'] },
        });
        if (!enabled)
            throw new Error('Analytics is not enabled for this organization');
        console.log(
            await new UsageUserActivityBuilder(storage).run(
                values['org-id'],
                values.from,
                values.to,
            ),
        );
    } finally {
        await database.destroy();
    }
}

void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
