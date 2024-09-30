import { subject } from '@casl/ability';
import {
    AdditionalMetric,
    DbtModelNode,
    DbtProjectType,
    DimensionType,
    findAndUpdateModelNodes,
    ForbiddenError,
    GitIntegrationConfiguration,
    isUserWithOrg,
    lightdashDbtYamlSchema,
    ParseError,
    PullRequestCreated,
    SavedChart,
    SessionUser,
    UnexpectedServerError,
} from '@lightdash/common';
import Ajv from 'ajv';
import * as yaml from 'js-yaml';
import {
    createBranch,
    getFileContent,
    getLastCommit,
    getOrRefreshToken,
    updateFile,
} from '../../clients/github/Github';
import { LightdashConfig } from '../../config/parseConfig';
import { GithubAppInstallationsModel } from '../../models/GithubAppInstallations/GithubAppInstallationsModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { BaseService } from '../BaseService';

type GitIntegrationServiceArguments = {
    lightdashConfig: LightdashConfig;
    savedChartModel: SavedChartModel;
    projectModel: ProjectModel;
    spaceModel: SpaceModel;
    githubAppInstallationsModel: GithubAppInstallationsModel;
};

// TODO move this to common and refactor cli
type YamlColumnMeta = {
    dimension?: {
        type?: DimensionType;
    };
};

type YamlColumn = {
    name: string;
    description?: string;
    meta?: YamlColumnMeta;
};

export type YamlModel = {
    name: string;
    description?: string;
    columns?: YamlColumn[];
    meta?: any;
};

export type YamlSchema = {
    version?: number;
    models?: DbtModelNode[];
};

export class GitIntegrationService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly savedChartModel: SavedChartModel;

    private readonly projectModel: ProjectModel;

    private readonly spaceModel: SpaceModel;

    private readonly githubAppInstallationsModel: GithubAppInstallationsModel;

    constructor(args: GitIntegrationServiceArguments) {
        super();
        this.lightdashConfig = args.lightdashConfig;
        this.savedChartModel = args.savedChartModel;
        this.projectModel = args.projectModel;
        this.spaceModel = args.spaceModel;
        this.githubAppInstallationsModel = args.githubAppInstallationsModel;
    }

    async getConfiguration(
        user: SessionUser,
        projectUuid: string,
    ): Promise<GitIntegrationConfiguration> {
        if (!isUserWithOrg(user)) {
            throw new UnexpectedServerError(
                'User is not part of an organization.',
            );
        }
        const installationId =
            await this.githubAppInstallationsModel.getInstallationId(
                user.organizationUuid,
            );
        // todo: check if installation has access to the project repository
        return {
            enabled: !!installationId,
        };
    }

    private static async loadYamlSchema(content: any): Promise<YamlSchema> {
        const schemaFile = yaml.load(content);

        const ajvCompiler = new Ajv({ coerceTypes: true });

        const validate = ajvCompiler.compile<YamlSchema>(
            lightdashDbtYamlSchema,
        );
        if (schemaFile === undefined) {
            return {
                version: 2,
            };
        }
        if (!validate(schemaFile)) {
            throw new ParseError(`Not valid schema ${validate}`);
        }
        return schemaFile;
    }

    static async createBranch({
        owner,
        repo,
        mainBranch,
        token,
    }: {
        owner: string;
        repo: string;
        mainBranch: string;
        token: string;
    }): Promise<string> {
        const { sha: commitSha } = await getLastCommit({
            owner,
            repo,
            branch: mainBranch,
            token,
        });
        // create branch in git
        const branchName = `add-custom-metrics-${Date.now()}`;
        const newBranch = await createBranch({
            branchName,
            owner,
            repo,
            sha: commitSha,
            token,
        });
        return branchName;
    }

    async getPullRequestDetails({
        user,
        customMetrics,
        owner,
        repo,
        mainBranch,
        branchName,
        chart,
        projectUuid,
    }: {
        user: SessionUser;
        customMetrics: AdditionalMetric[];
        owner: string;
        repo: string;
        mainBranch: string;
        branchName: string;
        chart?: SavedChart;
        projectUuid: string;
    }): Promise<PullRequestCreated> {
        const prTitle = chart
            ? `Added ${customMetrics.length} custom metrics from chart ${chart.name}`
            : `Added ${customMetrics.length} custom metrics`;

        // TODO should we use the api to get the link to the PR ?
        const prBody = `Created by Lightdash, this PR adds ${customMetrics.length} custom metrics to the dbt model
            
Triggered by user ${user.firstName} ${user.lastName} (${user.email})
`;

        const chartDetails = chart
            ? `
Affected charts: 
- [${chart.name}](${
                  new URL(
                      `/projects/${projectUuid}/charts/${chart.uuid}`,
                      this.lightdashConfig.siteUrl,
                  ).href
              })
        `
            : ``;

        const prUrl = `https://github.com/${owner}/${repo}/compare/${mainBranch}...${owner}:${repo}:${branchName}?expand=1&title=${prTitle}&body=${encodeURIComponent(
            prBody + chartDetails,
        )}`;
        return {
            prTitle,
            prUrl,
        };
    }

    async updateFileForCustomMetrics({
        user,
        owner,
        repo,
        projectUuid,
        customMetrics,
        branchName,
        token,
        quoteChar = `'`,
    }: {
        user: SessionUser;
        owner: string;
        repo: string;
        projectUuid: string;
        customMetrics: AdditionalMetric[] | undefined;
        branchName: string;
        token: string;
        quoteChar?: `"` | `'`;
    }): Promise<any> {
        if (customMetrics === undefined || customMetrics?.length === 0)
            throw new Error('No custom metrics found');
        const tables = [
            ...new Set(customMetrics.map((metric) => metric.table)),
        ];

        // use reduce to add files one by one
        await tables.reduce<Promise<void>>(async (acc, table) => {
            await acc;
            const customMetricsForTable = customMetrics.filter(
                (metric) => metric.table === table,
            );

            const explore = await this.projectModel.getExploreFromCache(
                projectUuid,
                table,
            );

            if (!explore.ymlPath)
                throw new Error(
                    'Explore is missing path, compile the project again to fix this issue',
                );

            const fileName = explore.ymlPath;

            // get yml from github
            const { content: fileContent, sha: fileSha } = await getFileContent(
                {
                    fileName,
                    owner,
                    repo,
                    branch: branchName,
                    token,
                },
            );

            const yamlSchema = await GitIntegrationService.loadYamlSchema(
                fileContent,
            );

            if (!yamlSchema.models)
                throw new Error(`Models not found ${yamlSchema}`);

            // call util function findAndUpdateModelNodes()
            const updatedModels = findAndUpdateModelNodes(
                yamlSchema.models,
                customMetricsForTable,
            );

            // update yml
            const updatedYml = yaml.dump(
                { ...yamlSchema, models: updatedModels },
                {
                    quotingType: quoteChar,
                },
            );

            const fileUpdated = await updateFile({
                owner,
                repo,
                fileName,
                content: updatedYml,
                fileSha,
                branchName,
                token,
                message: `Updated file ${fileName} with ${customMetricsForTable?.length} custom metrics from table ${table}`,
            });
            return acc;
        }, Promise.resolve());
    }

    async getProjectRepo(projectUuid: string) {
        const project = await this.projectModel.get(projectUuid);

        if (project.dbtConnection.type !== DbtProjectType.GITHUB)
            throw new Error(
                `invalid dbt connection type ${project.dbtConnection.type} for project ${project.name}`,
            );
        const [owner, repo] = project.dbtConnection.repository.split('/');
        const { branch } = project.dbtConnection;
        return { owner, repo, branch };
    }

    async getOrUpdateToken(organizationUuid: string) {
        const { token, refreshToken } =
            await this.githubAppInstallationsModel.getAuth(organizationUuid);
        const { token: newToken, refreshToken: newRefreshToken } =
            await getOrRefreshToken(token, refreshToken);
        if (newToken !== token) {
            await this.githubAppInstallationsModel.updateAuth(
                organizationUuid,
                newToken,
                newRefreshToken,
            );
        }
        return newToken;
    }

    async createPullRequestForChartFields(
        user: SessionUser,
        projectUuid: string,
        chartUuid: string,
    ): Promise<PullRequestCreated> {
        const chartDao = await this.savedChartModel.get(chartUuid);
        const space = await this.spaceModel.getSpaceSummary(chartDao.spaceUuid);
        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            chartDao.spaceUuid,
        );
        if (
            user.ability.cannot(
                'manage',
                subject('SavedChart', {
                    organizationUuid: user.organizationUuid!,
                    projectUuid,
                    isPrivate: space.isPrivate,
                    access,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const customMetrics = chartDao.metricQuery.additionalMetrics;
        if (customMetrics === undefined || customMetrics.length === 0)
            throw new Error('Missing custom metrics');

        const { owner, repo, branch } = await this.getProjectRepo(projectUuid);
        const token = await this.getOrUpdateToken(user.organizationUuid!);

        const branchName = await GitIntegrationService.createBranch({
            owner,
            repo,
            mainBranch: branch,
            token,
        });

        await this.updateFileForCustomMetrics({
            user,
            owner,
            customMetrics,
            repo,
            projectUuid,
            branchName,
            token,
        });

        const chart = {
            ...chartDao,
            isPrivate: space.isPrivate,
            access,
        };

        return this.getPullRequestDetails({
            user,
            customMetrics: customMetrics || [],
            owner,
            repo,
            mainBranch: branch,
            branchName,
            chart,
            projectUuid,
        });
    }

    async createPullRequestForCustomMetrics(
        user: SessionUser,
        projectUuid: string,
        customMetricsIds: string[],
        quoteChar: `"` | `'`,
    ): Promise<PullRequestCreated> {
        const chartSummaries = await this.savedChartModel.find({
            projectUuid,
        });
        const chartPromises = chartSummaries.map((summary) =>
            this.savedChartModel.get(summary.uuid, undefined),
        );
        const charts = await Promise.all(chartPromises);

        const chartsHasAccess = charts.map(async (chart) => {
            const space = await this.spaceModel.getSpaceSummary(
                chart.spaceUuid,
            );
            const access = this.spaceModel.getUserSpaceAccess(
                user.userUuid,
                chart.spaceUuid,
            );
            return user.ability.can(
                'manage',
                subject('SavedChart', {
                    organizationUuid: user.organizationUuid!,
                    projectUuid,
                    isPrivate: space.isPrivate,
                    access,
                }),
            );
        });

        if (chartsHasAccess.some((hasAccess) => !hasAccess))
            throw new ForbiddenError('User does not have access to all charts');

        const allCustomMetrics = charts.reduce<AdditionalMetric[]>(
            (acc, chart) => [
                ...acc,
                ...(chart.metricQuery.additionalMetrics || []),
            ],
            [],
        );

        // TODO does metrics have uuid ?
        const customMetrics = allCustomMetrics.filter((metric) =>
            customMetricsIds.includes(metric.uuid!),
        );
        if (customMetrics.length === 0)
            throw new Error('Missing custom metrics');

        const { owner, repo, branch } = await this.getProjectRepo(projectUuid);

        const token = await this.getOrUpdateToken(user.organizationUuid!);

        const branchName = await GitIntegrationService.createBranch({
            owner,
            repo,
            mainBranch: branch,
            token,
        });
        await this.updateFileForCustomMetrics({
            user,
            owner,
            customMetrics,
            repo,
            projectUuid,
            branchName,
            token,
            quoteChar,
        });
        return this.getPullRequestDetails({
            user,
            customMetrics: customMetrics || [],
            owner,
            repo,
            mainBranch: branch,
            branchName,
            chart: undefined,
            projectUuid,
        });
    }
}
