import {
    preAggregateMissReasonLabels,
    type DashboardPreAggregateAudit,
} from '@lightdash/common';
import { getConfig } from '../config';
import GlobalState from '../globalState';
import { checkLightdashVersion, lightdashApi } from './dbt/apiClient';

type PreAggregateAuditOptions = {
    dashboard?: string;
    project?: string;
    all?: boolean;
    json?: boolean;
    failOnMiss?: boolean;
    verbose?: boolean;
};

async function resolveProjectUuid(flagValue?: string): Promise<string> {
    if (flagValue) return flagValue;
    if (process.env.LIGHTDASH_PROJECT_UUID) {
        return process.env.LIGHTDASH_PROJECT_UUID;
    }
    const config = await getConfig();
    const projectUuid = config.context?.project;
    if (!projectUuid) {
        console.error(
            'No project selected. Pass --project <uuid>, set LIGHTDASH_PROJECT_UUID, or run `lightdash login`.',
        );
        process.exit(1);
    }
    return projectUuid;
}

async function fetchAudit(
    projectUuid: string,
    dashboardUuidOrSlug: string,
): Promise<DashboardPreAggregateAudit> {
    // DashboardPreAggregateAudit is an EE type excluded from the ApiResults union.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await lightdashApi<any>({
        method: 'GET',
        url: `/api/v2/projects/${projectUuid}/pre-aggregates/dashboards/${dashboardUuidOrSlug}/audit`,
        body: undefined,
    })) as DashboardPreAggregateAudit;
}

function renderSingle(
    audit: DashboardPreAggregateAudit,
    options: { json: boolean; verbose: boolean },
): void {
    if (options.json) {
        process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
        return;
    }
    const { hitCount, missCount, ineligibleCount } = audit.summary;
    process.stdout.write(
        `Dashboard: ${audit.dashboardName} (${audit.dashboardSlug})  ` +
            `${hitCount} hit  ${missCount} miss  — ${ineligibleCount} ineligible\n`,
    );
    for (const tab of audit.tabs) {
        const label = tab.tabName ?? '(untabbed)';
        process.stdout.write(`  Tab: ${label}\n`);
        const hits = tab.tiles.filter((t) => t.status === 'hit');
        const misses = tab.tiles.filter((t) => t.status === 'miss');
        const ineligible = tab.tiles.filter((t) => t.status === 'ineligible');
        for (const t of hits) {
            if (t.status === 'hit') {
                process.stdout.write(
                    `    HIT  ${t.tileName}  (pre-aggregate: ${t.preAggregateName})\n`,
                );
            }
        }
        for (const t of misses) {
            if (t.status === 'miss') {
                const reasonLabel = preAggregateMissReasonLabels[t.miss.reason];
                process.stdout.write(
                    `    MISS ${t.tileName}  (${reasonLabel})\n`,
                );
            }
        }
        if (options.verbose) {
            for (const t of ineligible) {
                if (t.status === 'ineligible') {
                    process.stdout.write(
                        `    --   ${t.tileName}  (${t.ineligibleReason})\n`,
                    );
                }
            }
        } else if (ineligible.length > 0) {
            process.stdout.write(
                `    ${ineligible.length} ineligible tile(s) hidden (pass --verbose to show)\n`,
            );
        }
    }
}

function exitIfFailOnMiss(
    audits: DashboardPreAggregateAudit[],
    flag: boolean,
): void {
    if (!flag) return;
    const anyMiss = audits.some((a) => a.summary.missCount > 0);
    if (anyMiss) process.exit(1);
}

async function runAll(args: {
    projectUuid: string;
    json: boolean;
    verbose: boolean;
    failOnMiss: boolean;
}): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dashboards = (await lightdashApi<any>({
        method: 'GET',
        url: `/api/v1/projects/${args.projectUuid}/dashboards`,
        body: undefined,
    })) as Array<{ uuid: string }>;
    const audits: DashboardPreAggregateAudit[] = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const d of dashboards) {
        // eslint-disable-next-line no-await-in-loop
        const audit = await fetchAudit(args.projectUuid, d.uuid);
        audits.push(audit);
        if (!args.json) {
            renderSingle(audit, { json: false, verbose: args.verbose });
        }
    }
    if (args.json) {
        process.stdout.write(
            `${JSON.stringify({ dashboards: audits }, null, 2)}\n`,
        );
    }
    exitIfFailOnMiss(audits, args.failOnMiss);
}

export const preAggregateAuditHandler = async (
    options: PreAggregateAuditOptions,
): Promise<void> => {
    GlobalState.debug(
        `pre-aggregate-audit options: ${JSON.stringify(options)}`,
    );
    await checkLightdashVersion();

    const projectUuid = await resolveProjectUuid(options.project);
    if (options.all) {
        await runAll({
            projectUuid,
            json: !!options.json,
            verbose: !!options.verbose,
            failOnMiss: !!options.failOnMiss,
        });
        return;
    }
    if (!options.dashboard) {
        console.error(
            'Either --dashboard <uuid-or-slug> or --all is required.',
        );
        process.exit(1);
    }

    const audit = await fetchAudit(projectUuid, options.dashboard);
    renderSingle(audit, {
        json: !!options.json,
        verbose: !!options.verbose,
    });
    exitIfFailOnMiss([audit], !!options.failOnMiss);
};

export const testHelpers = {
    renderSingle,
    exitIfFailOnMiss,
};
