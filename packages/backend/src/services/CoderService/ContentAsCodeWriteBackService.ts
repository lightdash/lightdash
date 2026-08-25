import {
    ContentAsCodeType,
    ContentType,
    getErrorMessage,
    SavedChartDAO,
    SessionUser,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import { ContentAsCodeAppliedRevisionModel } from '../../models/ContentAsCodeAppliedRevisionModel';
import { ContentVerificationModel } from '../../models/ContentVerificationModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SpaceModel } from '../../models/SpaceModel';
import { BaseService } from '../BaseService';
import { GitIntegrationService } from '../GitIntegrationService/GitIntegrationService';
import {
    hashContentAsCodeDocument,
    toCanonicalContentAsCodeSnapshot,
} from './contentAsCodeHash';
import { getContentAsCodeChartRelativePath } from './contentAsCodePaths';
import { dumpCanonicalContentAsCodeYaml } from './contentAsCodeYaml';
import { transformChartAsCode } from './transformChartAsCode';

type ContentAsCodeWriteBackServiceArguments = {
    lightdashConfig: LightdashConfig;
    projectModel: ProjectModel;
    contentAsCodeAppliedRevisionModel: ContentAsCodeAppliedRevisionModel;
    contentVerificationModel: ContentVerificationModel;
    dashboardModel: DashboardModel;
    spaceModel: SpaceModel;
    gitIntegrationService: GitIntegrationService;
};

export class ContentAsCodeWriteBackService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly projectModel: ProjectModel;

    private readonly contentAsCodeAppliedRevisionModel: ContentAsCodeAppliedRevisionModel;

    private readonly contentVerificationModel: ContentVerificationModel;

    private readonly dashboardModel: DashboardModel;

    private readonly spaceModel: SpaceModel;

    private readonly gitIntegrationService: GitIntegrationService;

    constructor(args: ContentAsCodeWriteBackServiceArguments) {
        super({ serviceName: 'ContentAsCodeWriteBackService' });
        this.lightdashConfig = args.lightdashConfig;
        this.projectModel = args.projectModel;
        this.contentAsCodeAppliedRevisionModel =
            args.contentAsCodeAppliedRevisionModel;
        this.contentVerificationModel = args.contentVerificationModel;
        this.dashboardModel = args.dashboardModel;
        this.spaceModel = args.spaceModel;
        this.gitIntegrationService = args.gitIntegrationService;
    }

    /**
     * Propose a managed-chart UI save as a git PR. The instance save already
     * succeeded; git failures are logged and never returned to the saver.
     * Editors do not need SourceCode — power users review the PR in git.
     */
    async writeBackManagedChartIfNeeded(
        user: SessionUser,
        chart: SavedChartDAO,
    ): Promise<void> {
        const { projectUuid, slug } = chart;
        if (!projectUuid || !slug) {
            return;
        }

        try {
            const [syncEnabled, writeBackEnabled] = await Promise.all([
                this.projectModel.getContentAsCodeSyncEnabled(projectUuid),
                this.projectModel.getContentAsCodeWriteBackEnabled(projectUuid),
            ]);
            if (!syncEnabled || !writeBackEnabled) {
                return;
            }

            if (await this.spaceModel.isDefaultUserSpace(chart.spaceUuid)) {
                return;
            }

            const spaces = await this.spaceModel.find({
                spaceUuids: [chart.spaceUuid],
            });
            if (spaces.length === 0) {
                return;
            }

            const revision =
                await this.contentAsCodeAppliedRevisionModel.findBySlug(
                    projectUuid,
                    ContentAsCodeType.CHART,
                    slug,
                );
            if (!revision) {
                return;
            }

            const chartAsCode = await this.buildChartAsCode(chart, spaces);
            const canonical = toCanonicalContentAsCodeSnapshot(chartAsCode);
            if (hashContentAsCodeDocument(canonical) === revision.contentHash) {
                return;
            }

            const yaml = dumpCanonicalContentAsCodeYaml(canonical);
            const instanceUrl = this.lightdashConfig.siteUrl;
            const chartUrl = `${instanceUrl}/projects/${projectUuid}/saved/${slug}`;
            await this.gitIntegrationService.writeBackContentAsCodeFile(
                user,
                projectUuid,
                {
                    slug,
                    filePath: getContentAsCodeChartRelativePath(slug),
                    content: yaml,
                    title: `Update chart \`${slug}\``,
                    description: `Updates the content-as-code YAML for chart \`${slug}\` after a UI save.

Instance: ${instanceUrl}
Chart: ${chartUrl}`,
                },
            );
        } catch (error) {
            this.logger.warn(
                'Content-as-code write-back failed after managed chart save',
                {
                    userUuid: user.userUuid,
                    projectUuid,
                    slug,
                    chartUuid: chart.uuid,
                    error: getErrorMessage(error),
                },
            );
        }
    }

    private async buildChartAsCode(
        chart: SavedChartDAO,
        spaces: Awaited<ReturnType<SpaceModel['find']>>,
    ) {
        const dashboardSlugs = chart.dashboardUuid
            ? await this.dashboardModel.getSlugsForUuids([chart.dashboardUuid])
            : {};
        const verificationMap =
            await this.contentVerificationModel.getByContentUuids(
                ContentType.CHART,
                [chart.uuid],
            );

        return transformChartAsCode(
            chart,
            spaces,
            dashboardSlugs,
            verificationMap,
        );
    }
}
