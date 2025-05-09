import { subject } from '@casl/ability';
import {
    BulkActionable,
    ForbiddenError,
    NotFoundError,
    Organization,
    ParameterError,
    Project,
    SavedSemanticViewerChart,
    SessionUser,
    SpaceShare,
    SpaceSummary,
    VIZ_DEFAULT_AGGREGATION,
    isVizBarChartConfig,
    isVizLineChartConfig,
    isVizPieChartConfig,
    type AbilityAction,
    type SemanticViewerChartCreate,
    type SemanticViewerChartCreateResult,
    type SemanticViewerChartUpdate,
    type SemanticViewerChartUpdateResult,
} from '@lightdash/common';
import { Knex } from 'knex';
import { uniq } from 'lodash';
import {
    CreateSemanticViewerChartVersionEvent,
    LightdashAnalytics,
} from '../../analytics/LightdashAnalytics';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedSemanticViewerChartModel } from '../../models/SavedSemanticViewerChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { BaseService } from '../BaseService';

type SavedSemanticViewerChartServiceArguments = {
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    spaceModel: SpaceModel;
    savedSemanticViewerChartModel: SavedSemanticViewerChartModel;
};

export class SavedSemanticViewerChartService
    extends BaseService
    implements BulkActionable<Knex>
{
    private readonly analytics: LightdashAnalytics;

    private readonly projectModel: ProjectModel;

    private readonly spaceModel: SpaceModel;

    private readonly savedSemanticViewerChartModel: SavedSemanticViewerChartModel;

    constructor(args: SavedSemanticViewerChartServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.projectModel = args.projectModel;
        this.spaceModel = args.spaceModel;
        this.savedSemanticViewerChartModel = args.savedSemanticViewerChartModel;
    }

    static getCreateVersionEventProperties(
        config: SavedSemanticViewerChart['config'],
        semanticLayerQuery: SavedSemanticViewerChart['semanticLayerQuery'],
    ): Pick<
        CreateSemanticViewerChartVersionEvent['properties'],
        | 'semanticLayerQuery'
        | 'chartKind'
        | 'barChart'
        | 'lineChart'
        | 'pieChart'
    > {
        return {
            semanticLayerQuery,

            chartKind: config.type,

            barChart: isVizBarChartConfig(config)
                ? {
                      groupByCount: (config.fieldConfig?.groupBy ?? []).length,
                      yAxisCount: (config.fieldConfig?.y ?? []).length,
                      aggregationTypes: uniq(
                          (config.fieldConfig?.y ?? []).map(
                              (y) => y.aggregation ?? VIZ_DEFAULT_AGGREGATION,
                          ),
                      ),
                  }
                : undefined,
            lineChart: isVizLineChartConfig(config)
                ? {
                      groupByCount: (config.fieldConfig?.groupBy ?? []).length,
                      yAxisCount: (config.fieldConfig?.y ?? []).length,
                      aggregationTypes: uniq(
                          (config.fieldConfig?.y ?? []).map(
                              (y) => y.aggregation ?? VIZ_DEFAULT_AGGREGATION,
                          ),
                      ),
                  }
                : undefined,
            pieChart: isVizPieChartConfig(config)
                ? {
                      groupByCount: config.fieldConfig?.x ? 1 : 0,
                  }
                : undefined,
        };
    }

    async hasAccess(
        action: AbilityAction,
        actor: {
            user: SessionUser;
            projectUuid: string;
        },
        resource:
            | {
                  savedSemanticViewerChartUuid: null;
                  spaceUuid: string;
              }
            | {
                  savedSemanticViewerChartUuid: string;
                  spaceUuid?: string;
              },
    ): Promise<SpaceShare[]> {
        let { spaceUuid } = resource;

        if (resource.savedSemanticViewerChartUuid !== null) {
            const savedSemanticViewerChart =
                await this.savedSemanticViewerChartModel.getByUuid(
                    actor.projectUuid,
                    resource.savedSemanticViewerChartUuid,
                );

            if (!savedSemanticViewerChart) {
                throw new NotFoundError(
                    'Saved Semantic Viewer Chart not found',
                );
            }

            spaceUuid = savedSemanticViewerChart.space.uuid;
        }

        if (!spaceUuid) {
            throw new NotFoundError('Space is required');
        }

        const space = await this.spaceModel.getSpaceSummary(spaceUuid);
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            actor.user.userUuid,
            spaceUuid,
        );

        const hasPermission = actor.user.ability.can(
            action,
            subject('SavedChart', {
                organizationUuid: space.organizationUuid,
                projectUuid: actor.projectUuid,
                isPrivate: space.isPrivate,
                access: spaceAccess,
            }),
        );

        if (!hasPermission) {
            throw new ForbiddenError(
                `You don't have access to ${action} this Saved Semantic Viewer Chart`,
            );
        }

        if (resource.spaceUuid && spaceUuid !== resource.spaceUuid) {
            const newSpace = await this.spaceModel.getSpaceSummary(
                resource.spaceUuid,
            );
            const newSpaceAccess = await this.spaceModel.getUserSpaceAccess(
                actor.user.userUuid,
                resource.spaceUuid,
            );

            const hasPermissionInNewSpace = actor.user.ability.can(
                action,
                subject('SavedChart', {
                    organizationUuid: newSpace.organizationUuid,
                    projectUuid: actor.projectUuid,
                    isPrivate: newSpace.isPrivate,
                    access: newSpaceAccess,
                }),
            );

            if (!hasPermissionInNewSpace) {
                throw new ForbiddenError(
                    `You don't have access to ${action} this Saved Semantic Viewer Chart in the new space`,
                );
            }
        }

        return spaceAccess;
    }

    async getSemanticViewerChart(
        user: SessionUser,
        projectUuid: string,
        findBy: {
            uuid?: string;
            slug?: string;
        },
    ): Promise<SavedSemanticViewerChart> {
        if (!findBy.uuid && !findBy.slug) {
            throw new Error(
                'Either savedSemanticViewerChartUuid or slug must be provided',
            );
        }

        let savedChart;
        if (findBy.uuid) {
            savedChart = await this.savedSemanticViewerChartModel.getByUuid(
                projectUuid,
                findBy.uuid,
            );
        } else if (findBy.slug) {
            savedChart = await this.savedSemanticViewerChartModel.getBySlug(
                projectUuid,
                findBy.slug,
            );
        } else {
            throw new Error(
                'Either savedSemanticViewerChartUuid or slug must be provided',
            );
        }

        const userAccess = await this.hasAccess(
            'view',
            {
                user,
                projectUuid,
            },
            {
                savedSemanticViewerChartUuid:
                    savedChart.savedSemanticViewerChartUuid,
            },
        );

        this.analytics.track({
            event: 'semantic_viewer_chart.view',
            userId: user.userUuid,
            properties: {
                chartId: savedChart.savedSemanticViewerChartUuid,
                projectId: savedChart.project.projectUuid,
                organizationId: savedChart.organization.organizationUuid,
            },
        });
        return {
            ...savedChart,
            space: {
                ...savedChart.space,
                userAccess: userAccess[0],
            },
        };
    }

    async createSemanticViewerChart(
        user: SessionUser,
        projectUuid: string,
        semanticViewerChart: SemanticViewerChartCreate,
    ): Promise<SemanticViewerChartCreateResult> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        await this.hasAccess(
            'create',
            { user, projectUuid },
            {
                savedSemanticViewerChartUuid: null,
                spaceUuid: semanticViewerChart.spaceUuid,
            },
        );

        const createdChart = await this.savedSemanticViewerChartModel.create(
            user.userUuid,
            projectUuid,
            semanticViewerChart,
        );

        this.analytics.track({
            event: 'semantic_viewer_chart.created',
            userId: user.userUuid,
            properties: {
                chartId: createdChart.savedSemanticViewerChartUuid,
                projectId: projectUuid,
                organizationId: organizationUuid,
            },
        });

        this.analytics.track({
            event: 'semantic_viewer_chart_version.created',
            userId: user.userUuid,
            properties: {
                chartId: createdChart.savedSemanticViewerChartUuid,
                versionId: createdChart.savedSemanticViewerChartVersionUuid,
                projectId: projectUuid,
                organizationId: organizationUuid,
                ...SavedSemanticViewerChartService.getCreateVersionEventProperties(
                    semanticViewerChart.config,
                    semanticViewerChart.semanticLayerQuery,
                ),
            },
        });

        return createdChart;
    }

    async updateSemanticViewerChart(
        user: SessionUser,
        projectUuid: string,
        savedSemanticViewerChartUuid: string,
        update: SemanticViewerChartUpdate,
    ): Promise<SemanticViewerChartUpdateResult> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        const savedChart = await this.savedSemanticViewerChartModel.getByUuid(
            projectUuid,
            savedSemanticViewerChartUuid,
        );

        await this.hasAccess(
            'update',
            { user, projectUuid },
            { savedSemanticViewerChartUuid },
        );

        const updatedChart = await this.savedSemanticViewerChartModel.update({
            userUuid: user.userUuid,
            savedSemanticViewerChartUuid,
            update,
        });

        this.analytics.track({
            event: 'semantic_viewer_chart.updated',
            userId: user.userUuid,
            properties: {
                chartId: savedChart.savedSemanticViewerChartUuid,
                projectId: savedChart.project.projectUuid,
                organizationId: savedChart.organization.organizationUuid,
            },
        });

        if (updatedChart.savedSemanticViewerChartUuid && update.versionedData) {
            this.analytics.track({
                event: 'semantic_viewer_chart_version.created',
                userId: user.userUuid,
                properties: {
                    chartId: updatedChart.savedSemanticViewerChartUuid,
                    versionId: updatedChart.savedSemanticViewerChartVersionUuid,
                    projectId: projectUuid,
                    organizationId: organizationUuid,
                    ...SavedSemanticViewerChartService.getCreateVersionEventProperties(
                        update.versionedData.config,
                        update.versionedData.semanticLayerQuery,
                    ),
                },
            });
        }

        return updatedChart;
    }

    async deleteSemanticViewerChart(
        user: SessionUser,
        projectUuid: string,
        savedSemanticViewerChartUuid: string,
    ): Promise<void> {
        const savedChart = await this.savedSemanticViewerChartModel.getByUuid(
            projectUuid,
            savedSemanticViewerChartUuid,
        );

        await this.hasAccess(
            'delete',
            { user, projectUuid },
            { savedSemanticViewerChartUuid },
        );

        await this.savedSemanticViewerChartModel.delete(
            savedSemanticViewerChartUuid,
        );

        this.analytics.track({
            event: 'semantic_viewer_chart.deleted',
            userId: user.userUuid,
            properties: {
                chartId: savedChart.savedSemanticViewerChartUuid,
                projectId: savedChart.project.projectUuid,
                organizationId: savedChart.organization.organizationUuid,
            },
        });
    }

    async moveToSpace(
        user: SessionUser,
        {
            projectUuid,
            itemUuid: savedSemanticViewerChartUuid,
            targetSpaceUuid,
        }: {
            projectUuid: string;
            itemUuid: string;
            targetSpaceUuid: string | null;
        },
        {
            tx,
            checkForAccess = true,
            trackEvent = true,
        }: {
            tx?: Knex;
            checkForAccess?: boolean;
            trackEvent?: boolean;
        } = {},
    ): Promise<void> {
        if (!targetSpaceUuid) {
            throw new ParameterError(
                'You cannot move a dashboard outside of a space',
            );
        }
        if (checkForAccess) {
            await this.hasAccess(
                'update',
                { user, projectUuid },
                { savedSemanticViewerChartUuid },
            );
        }

        await this.savedSemanticViewerChartModel.moveToSpace(
            {
                projectUuid,
                itemUuid: savedSemanticViewerChartUuid,
                targetSpaceUuid,
            },
            { tx },
        );

        if (trackEvent) {
            this.analytics.track({
                event: 'semantic_viewer_chart.moved',
                userId: user.userUuid,
                properties: {
                    projectId: projectUuid,
                    semanticViewerChartId: savedSemanticViewerChartUuid,
                    targetSpaceId: targetSpaceUuid,
                },
            });
        }
    }
}
