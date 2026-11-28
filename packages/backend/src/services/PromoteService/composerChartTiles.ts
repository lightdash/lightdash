import {
    AlreadyExistsError,
    assertUnreachable,
    isDashboardComposerChartTile,
    NotSupportedError,
    PromotionAction,
    type DashboardTile,
    type PromotedComposerChart,
    type PromotionChanges,
    type RegisteredAccount,
} from '@lightdash/common';
import { isEqual } from 'es-toolkit/compat';
import { type ComposerChartModel } from '../../models/ComposerChartModel';
import { type ComposerChartService } from '../ComposerChartService/ComposerChartService';

export type PromoteComposerChartModel = Pick<
    ComposerChartModel,
    'get' | 'findIdentityBySlug' | 'getOwner' | 'deleteOrphans'
>;

export type PromoteComposerChartService = Pick<
    ComposerChartService,
    'isEnabled' | 'preflightDashboard' | 'preflightPipeline' | 'writeFromCode'
>;

type ComposerChartChange = NonNullable<
    PromotionChanges['composerCharts']
>[number];

const getComposerChartUuids = (tiles: DashboardTile[]) => [
    ...new Set(
        tiles
            .filter(isDashboardComposerChartTile)
            .flatMap((tile) => tile.properties.composerChartUuid ?? []),
    ),
];

/** Matches each chart upstream by slug, among the charts of the upstream dashboard. */
export const getComposerChartChanges = async (
    composerChartModel: PromoteComposerChartModel,
    tiles: DashboardTile[],
    upstream: { projectUuid: string; dashboardUuid: string | null },
): Promise<ComposerChartChange[]> => {
    const changes: ComposerChartChange[] = [];
    for (const chartUuid of getComposerChartUuids(tiles)) {
        /* eslint-disable no-await-in-loop */
        const source = await composerChartModel.get(chartUuid);
        if (source.owner.type === 'space') {
            throw new NotSupportedError(
                `This dashboard cannot be promoted yet because it shows the composer chart "${source.slug}", which is saved in a space`,
            );
        }
        const promoted: PromotedComposerChart = {
            uuid: source.uuid,
            oldUuid: source.uuid,
            slug: source.slug,
            projectUuid: upstream.projectUuid,
            name: source.name,
            description: source.description,
            chart: source.chart,
        };
        const identity = await composerChartModel.findIdentityBySlug(
            upstream.projectUuid,
            source.slug,
        );
        if (!identity || identity.deleted) {
            changes.push({ action: PromotionAction.CREATE, data: promoted });
        } else {
            const { owner } = await composerChartModel.getOwner(identity.uuid);
            switch (owner.type) {
                case 'dashboard':
                    if (owner.dashboardUuid !== upstream.dashboardUuid) {
                        throw new AlreadyExistsError(
                            `Composer chart "${source.slug}" already belongs to another dashboard in the upstream project`,
                        );
                    }
                    break;
                case 'space':
                    throw new AlreadyExistsError(
                        `Composer chart "${source.slug}" already belongs to a space in the upstream project`,
                    );
                default:
                    return assertUnreachable(
                        owner,
                        'Unknown composer chart owner',
                    );
            }
            const current = await composerChartModel.get(identity.uuid);
            const unchanged =
                current.name === source.name &&
                current.description === source.description &&
                isEqual(current.pipeline, source.pipeline) &&
                isEqual(current.chart, source.chart);
            changes.push({
                action: unchanged
                    ? PromotionAction.NO_CHANGES
                    : PromotionAction.UPDATE,
                data: { ...promoted, uuid: identity.uuid },
            });
        }
        /* eslint-enable no-await-in-loop */
    }
    return changes;
};

/** Runs the pipeline checks a save would, against the upstream project, before anything is written. */
export const preflightComposerChartChanges = async (
    composerChartModel: PromoteComposerChartModel,
    composerChartService: PromoteComposerChartService,
    account: RegisteredAccount,
    upstream: { organizationUuid: string; projectUuid: string },
    changes: ComposerChartChange[],
) => {
    for (const change of changes) {
        if (change.action !== PromotionAction.NO_CHANGES) {
            /* eslint-disable no-await-in-loop */
            const { pipeline } = await composerChartModel.get(
                change.data.oldUuid,
            );
            await composerChartService.preflightPipeline(
                account,
                upstream,
                pipeline,
            );
            /* eslint-enable no-await-in-loop */
        }
    }
};

/** Writes through the content-as-code save, so every save check runs again upstream. */
export const upsertComposerCharts = async (
    composerChartModel: PromoteComposerChartModel,
    composerChartService: PromoteComposerChartService,
    account: RegisteredAccount,
    promotionChanges: PromotionChanges,
): Promise<PromotionChanges> => {
    const changes = promotionChanges.composerCharts ?? [];
    if (changes.length === 0) return promotionChanges;
    const [dashboardChange] = promotionChanges.dashboards;
    const upstreamUuids = new Map<string, string>();
    // One at a time: composer slugs take no lock
    for (const { action, data } of changes) {
        if (action === PromotionAction.NO_CHANGES) {
            upstreamUuids.set(data.oldUuid, data.uuid);
        } else {
            /* eslint-disable no-await-in-loop */
            const { pipeline } = await composerChartModel.get(data.oldUuid);
            const uuid = await composerChartService.writeFromCode(
                account,
                data.projectUuid,
                {
                    slug: data.slug,
                    dashboardUuid: dashboardChange.data.uuid,
                    spaceOwner: 'refuse',
                    name: data.name,
                    description: data.description,
                    pipeline,
                    chart: data.chart,
                },
            );
            /* eslint-enable no-await-in-loop */
            upstreamUuids.set(data.oldUuid, uuid);
        }
    }
    return {
        ...promotionChanges,
        dashboards: [
            {
                ...dashboardChange,
                data: {
                    ...dashboardChange.data,
                    tiles: dashboardChange.data.tiles.map((tile) =>
                        isDashboardComposerChartTile(tile) &&
                        tile.properties.composerChartUuid
                            ? {
                                  ...tile,
                                  properties: {
                                      ...tile.properties,
                                      composerChartUuid:
                                          upstreamUuids.get(
                                              tile.properties.composerChartUuid,
                                          ) ?? null,
                                  },
                              }
                            : tile,
                    ),
                },
            },
        ],
    };
};
