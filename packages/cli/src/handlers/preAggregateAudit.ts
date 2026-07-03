import {
    PreAggregateMissReason,
    preAggregateMissReasonLabels,
    type DashboardPreAggregateAudit,
    type PreAggregateMatchMiss,
    type TilePreAggregateAuditHit,
    type TilePreAggregateAuditMiss,
} from '@lightdash/common';
import { getConfig } from '../config';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { checkLightdashVersion, lightdashApi } from './dbt/apiClient';

type EligibleTile = TilePreAggregateAuditHit | TilePreAggregateAuditMiss;

type ExploreGroup = {
    exploreLabel: string;
    charts: { chartName: string; tile: EligibleTile }[];
};

type ExploreGroups = {
    groups: ExploreGroup[];
    anyCollapsed: boolean;
};

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

function formatMissDetail(
    miss: PreAggregateMatchMiss,
    missFieldLabel: string | null,
): string {
    const base = preAggregateMissReasonLabels[miss.reason];
    if (miss.reason === PreAggregateMissReason.GRANULARITY_TOO_FINE) {
        return `${base} (query ${miss.queryGranularity}, pre-agg ${miss.preAggregateGranularity})`;
    }
    if (missFieldLabel) {
        return `${base} (${missFieldLabel})`;
    }
    return base;
}

function buildExploreGroups(audit: DashboardPreAggregateAudit): ExploreGroups {
    const eligible = audit.tabs
        .flatMap((tab) => tab.tiles)
        .filter(
            (t): t is EligibleTile => t.status === 'hit' || t.status === 'miss',
        );

    const byLabel = new Map<string, EligibleTile[]>();
    for (const tile of eligible) {
        const arr = byLabel.get(tile.exploreLabel) ?? [];
        arr.push(tile);
        byLabel.set(tile.exploreLabel, arr);
    }

    let anyCollapsed = false;
    const groups = [...byLabel.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([exploreLabel, tiles]) => {
            const byName = new Map<string, EligibleTile[]>();
            for (const tile of tiles) {
                const arr = byName.get(tile.chartName) ?? [];
                arr.push(tile);
                byName.set(tile.chartName, arr);
            }
            const charts = [...byName.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([chartName, chartTiles]) => {
                    const miss = chartTiles.find((t) => t.status === 'miss');
                    const hasHit = chartTiles.some((t) => t.status === 'hit');
                    if (miss && hasHit) anyCollapsed = true;
                    return { chartName, tile: miss ?? chartTiles[0] };
                });
            return { exploreLabel, charts };
        });

    return { groups, anyCollapsed };
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

    const { groups, anyCollapsed } = buildExploreGroups(audit);
    const nameWidth = groups
        .flatMap((g) => g.charts.map((c) => c.chartName.length))
        .reduce((max, len) => Math.max(max, len), 0);

    for (const group of groups) {
        process.stdout.write(`${styles.bold(group.exploreLabel)}\n`);
        for (const { chartName, tile } of group.charts) {
            const name = chartName.padEnd(nameWidth);
            if (tile.status === 'hit') {
                process.stdout.write(
                    `  ${styles.success('✓')} ${name}  hit — pre-aggregate: ${
                        tile.preAggregateName
                    }\n`,
                );
            } else {
                const detail = formatMissDetail(tile.miss, tile.missFieldLabel);
                process.stdout.write(
                    `  ${styles.error('✗')} ${name}  miss — ${detail}\n`,
                );
            }
        }
    }

    const ineligible = audit.tabs
        .flatMap((tab) => tab.tiles)
        .filter((t) => t.status === 'ineligible');
    if (options.verbose) {
        if (ineligible.length > 0) {
            process.stdout.write('Ineligible\n');
            for (const t of ineligible) {
                if (t.status === 'ineligible') {
                    process.stdout.write(
                        `  — ${t.tileName}  (${t.ineligibleReason})\n`,
                    );
                }
            }
        }
    } else if (ineligible.length > 0) {
        process.stdout.write(
            `Ineligible (${ineligible.length} hidden — pass --verbose)\n`,
        );
    }

    if (anyCollapsed) {
        process.stdout.write(
            `${styles.secondary(
                'Note: charts sharing a name were collapsed to their worst status (miss over hit).',
            )}\n`,
        );
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
    buildExploreGroups,
    formatMissDetail,
};
