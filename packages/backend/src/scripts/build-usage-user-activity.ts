import { parseArgs } from 'node:util';
import { usageProcessingStartDate } from '../analytics/eventStream/usageProcessingWindow';
import {
    UsageUserActivityBuilder,
    validateUserActivityRange,
} from '../analytics/eventStream/UsageUserActivityBuilder';
import { lightdashConfig } from '../config/lightdashConfig';
import { parseUsageEventsS3Config } from '../config/parseConfig';
import { getEnterpriseAppArguments } from '../ee';

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
    const { serviceProviders } = await getEnterpriseAppArguments();
    if (
        lightdashConfig.analyticsProject.disabled ||
        !serviceProviders?.analyticsProjectService
    )
        throw new Error('Managed analytics is not enabled');
    console.log(
        await new UsageUserActivityBuilder(storage).run(
            values['org-id'],
            values.from,
            values.to,
        ),
    );
}

void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
