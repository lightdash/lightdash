import { subject } from '@casl/ability';
import {
    ContentAsCodeType,
    ContentType,
    getErrorMessage,
    SavedChartDAO,
    SessionUser,
} from '@lightdash/common'; // pragma: allowlist secret
import { ContentAsCodeAppliedRevisionModel } from '../../models/ContentAsCodeAppliedRevisionModel';
import { ContentVerificationModel } from '../../models/ContentVerificationModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
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
    contentAsCodeAppliedRevisionModel: ContentAsCodeAppliedRevisionModel;
    contentVerificationModel: ContentVerificationModel;
    dashboardModel: DashboardModel;
    spaceModel: SpaceModel;
    gitIntegrationService: GitIntegrationService;
};

export class ContentAsCodeWriteBackService extends BaseService {
    private readonly contentAsCodeAppliedRevisionModel: ContentAsCodeAppliedRevisionModel;

    private readonly contentVerificationModel: ContentVerificationModel;

    private readonly dashboardModel: DashboardModel;

    private readonly spaceModel: SpaceModel;

    private readonly gitIntegrationService: GitIntegrationService;

    constructor(args: ContentAsCodeWriteBackServiceArguments) {
        super({ serviceName: 'ContentAsCodeWriteBackService' });
        this.contentAsCodeAppliedRevisionModel =
            args.contentAsCodeAppliedRevisionModel;
        this.contentVerificationModel = args.contentVerificationModel;
        this.dashboardModel = args.dashboardModel;
        this.spaceModel = args.spaceModel;
        this.gitIntegrationService = args.gitIntegrationService;
    }

    async writeBackManagedChartIfNeeded(
        user: SessionUser,
        chart: SavedChartDAO,
    ): Promise<void> {
        const { projectUuid, slug, organizationUuid } = chart;
        if (!projectUuid || !slug) {
            return;
        }

        try {
            const revision =
                await this.contentAsCodeAppliedRevisionModel.findBySlug(
                    projectUuid,
                    ContentAsCodeType.CHART,
                    slug,
                );
            if (!revision) {
                return;
            }

            const ability = this.createAuditedAbility(user);
            if (
                ability.cannot(
                    'manage',
                    subject('SourceCode', {
                        organizationUuid,
                        projectUuid,
                        isProtectedBranch: false,
                        metadata: { slug, chartUuid: chart.uuid },
                    }),
                )
            ) {
                this.logger.warn(
                    'Skipping content-as-code write-back; user cannot manage SourceCode',
                    {
                        userUuid: user.userUuid,
                        projectUuid,
                        slug,
                    },
                );
                return;
            }

            const chartAsCode = await this.buildChartAsCode(chart);
            const canonical = toCanonicalContentAsCodeSnapshot(chartAsCode);
            if (hashContentAsCodeDocument(canonical) === revision.contentHash) {
                return;
            }

            const yaml = dumpCanonicalContentAsCodeYaml(canonical);
            await this.gitIntegrationService.writeBackContentAsCodeFile(
                user,
                projectUuid,
                {
                    filePath: getContentAsCodeChartRelativePath(slug),
                    content: yaml,
                    title: `Update chart \`${slug}\``,
                    description: `Updates the content-as-code YAML for chart \`${slug}\` after a UI save.`,
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

    private async buildChartAsCode(chart: SavedChartDAO) {
        const spaces = await this.spaceModel.find({
            spaceUuids: [chart.spaceUuid],
        });
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
