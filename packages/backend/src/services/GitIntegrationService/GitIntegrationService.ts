import { subject } from '@casl/ability';
import {
    AdditionalMetric,
    AnyType,
    ApiGithubDbtWritePreview,
    DbtModelNode,
    DbtProjectType,
    DimensionType,
    FileChanges,
    findAndUpdateModelNodes,
    ForbiddenError,
    friendlyName,
    GitIntegrationConfiguration,
    isUserWithOrg,
    lightdashDbtYamlSchema,
    ParameterError,
    ParseError,
    PullRequestCreated,
    QueryExecutionContext,
    SavedChart,
    SessionUser,
    snakeCaseName,
    UnexpectedServerError,
    VizColumn,
} from '@lightdash/common';
import Ajv from 'ajv';
import { diffLines } from 'diff';
import * as yaml from 'js-yaml';
import { nanoid } from 'nanoid';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import {
    checkFileDoesNotExist,
    createBranch,
    createFile,
    createPullRequest,
    getFileContent,
    getLastCommit,
    getOrRefreshToken,
    updateFile,
} from '../../clients/github/Github';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
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
    analytics: LightdashAnalytics;
};

type GithubProps = {
    owner: string;
    repo: string;
    branch: string;
    token: string;
    path: string;
    installationId: string;
    mainBranch: string;
    quoteChar: `"` | `'`;
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
    meta?: AnyType;
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

    private readonly analytics: LightdashAnalytics;

    constructor(args: GitIntegrationServiceArguments) {
        super();
        this.lightdashConfig = args.lightdashConfig;
        this.savedChartModel = args.savedChartModel;
        this.projectModel = args.projectModel;
        this.spaceModel = args.spaceModel;
        this.githubAppInstallationsModel = args.githubAppInstallationsModel;
        this.analytics = args.analytics;
    }

    async getInstallationId(user: SessionUser) {
        const installationId =
            await this.githubAppInstallationsModel.getInstallationId(
                user.organizationUuid!,
            );
        if (!installationId) {
            throw new Error('Invalid Github installation id');
        }
        return installationId;
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

    private static async loadYamlSchema(content: AnyType): Promise<YamlSchema> {
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
        installationId,
        branch,
    }: {
        branch: string;
        owner: string;
        repo: string;
        mainBranch: string;
        token: string;
        installationId: string;
    }) {
        const { sha: commitSha } = await getLastCommit({
            owner,
            repo,
            branch: mainBranch,
            token,
        });
        Logger.debug(
            `Creating branch ${branch} from ${mainBranch} (commit: ${commitSha}) in ${owner}/${repo}`,
        );
        // create branch in git
        const newBranch = await createBranch({
            branch,
            owner,
            repo,
            sha: commitSha,
            installationId,
        });
        Logger.debug(
            `Successfully created branch ${branch} in ${owner}/${repo}`,
        );
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

    static generateDiff(original: string, updated: string): string {
        const diff = diffLines(original, updated);
        return diff
            .reduce<string[]>((acc, part) => {
                if (part.added) return [...acc, `+${part.value}`];
                if (part.removed) return [...acc, `-${part.value}`];
                return acc;
            }, [])
            .join('\n');
    }

    async updateFileForCustomMetrics({
        owner,
        repo,
        path,
        projectUuid,
        customMetrics,
        token,
        branch,
        quoteChar = `'`,
    }: {
        owner: string;
        repo: string;
        path: string;
        projectUuid: string;
        customMetrics: AdditionalMetric[] | undefined;
        branch: string;
        token: string;
        quoteChar?: `"` | `'`;
    }): Promise<FileChanges[]> {
        if (customMetrics === undefined || customMetrics?.length === 0)
            throw new Error('No custom metrics found');
        const tables = [
            ...new Set(customMetrics.map((metric) => metric.table)),
        ];

        const updatedFiles = await tables.reduce<Promise<FileChanges[]>>(
            async (accPromise, table) => {
                const acc = await accPromise;
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

                // Github's path cannot start with a slash
                const fileName = `${path.replace(/^\//, '')}/${
                    explore.ymlPath
                }`;
                const { content: fileContent, sha: fileSha } =
                    await getFileContent({
                        fileName,
                        owner,
                        repo,
                        branch,
                        token,
                    });
                Logger.debug(
                    `Updating file ${fileName} in ${owner}/${repo} (branch: ${branch}, sha: ${fileSha})`,
                );

                const yamlSchema = await GitIntegrationService.loadYamlSchema(
                    fileContent,
                );

                if (!yamlSchema.models)
                    throw new Error(`Models not found ${yamlSchema}`);

                const updatedModels = findAndUpdateModelNodes(
                    yamlSchema.models,
                    customMetricsForTable,
                );

                const updatedYml = yaml.dump(
                    { ...yamlSchema, models: updatedModels },
                    {
                        quotingType: quoteChar,
                    },
                );
                const diff = GitIntegrationService.generateDiff(
                    fileContent,
                    updatedYml,
                );

                const fileUpdated = await updateFile({
                    owner,
                    repo,
                    fileName,
                    content: updatedYml,
                    fileSha,
                    branchName: branch,
                    token,
                    message: `Updated file ${fileName} with ${customMetricsForTable?.length} custom metrics from table ${table}`,
                });
                Logger.debug(
                    `Successfully updated file ${fileName} in ${owner}/${repo} (branch: ${branch})`,
                );

                const changes = {
                    file: fileName,
                    yml: updatedYml,
                    diff,
                };
                return [...acc, changes];
            },
            Promise.resolve([]),
        );

        return updatedFiles;
    }

    async getProjectRepo(projectUuid: string) {
        const project = await this.projectModel.get(projectUuid);

        if (project.dbtConnection.type !== DbtProjectType.GITHUB)
            throw new ParameterError(
                `invalid dbt connection type ${project.dbtConnection.type} for project ${project.name}`,
            );
        const [owner, repo] = project.dbtConnection.repository.split('/');
        const { branch } = project.dbtConnection;
        const path = project.dbtConnection.project_sub_path;
        return { owner, repo, branch, path };
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

        const { owner, repo, branch, path } = await this.getProjectRepo(
            projectUuid,
        );
        const token = await this.getOrUpdateToken(user.organizationUuid!);

        const installationId = await this.getInstallationId(user);
        const branchName = `add-custom-metrics-${Date.now()}`;

        await GitIntegrationService.createBranch({
            branch: branchName,
            owner,
            repo,
            mainBranch: branch,
            token,
            installationId,
        });

        await this.updateFileForCustomMetrics({
            owner,
            customMetrics,
            repo,
            path,
            projectUuid,
            branch,
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

    /*
    Gets all the information needed to create a branch and a pull request
    - owner: The owner of the repository
    - repo: The repository name
    - branch: A unique generated branch name (eg: lightdash-johndoe-1234)
    - mainBranch: The original branch of the project (eg: main)
    - path: The path to the project (eg: lightdash/dbt)
    - installationId: The installation id of the user
    - quoteChar: The quote character to use when replacing YML content ("" or "'")
    */
    private async getGithubProps(
        user: SessionUser,
        projectUuid: string,
        quoteChar: `"` | `'`,
    ) {
        const { owner, repo, branch, path } = await this.getProjectRepo(
            projectUuid,
        );
        const installationId = await this.getInstallationId(user);

        const token = await this.getOrUpdateToken(user.organizationUuid!);
        const userName = `${snakeCaseName(
            user.firstName[0] || '',
        )}${snakeCaseName(user.lastName)}`;
        const branchName = `lightdash-${userName}-${nanoid(4)}`;

        const githubProps: GithubProps = {
            owner,
            repo,
            branch: branchName,
            mainBranch: branch,
            token,
            path,
            installationId,
            quoteChar,
        };
        return githubProps;
    }

    async createPullRequestForCustomMetrics(
        user: SessionUser,
        projectUuid: string,
        customMetrics: AdditionalMetric[],
        quoteChar: `"` | `'`,
    ): Promise<PullRequestCreated> {
        if (customMetrics.length === 0)
            throw new ParseError('Missing custom metrics');

        if (
            user.ability.cannot(
                'manage',
                subject('CustomSql', {
                    organizationUuid: user.organizationUuid!,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const githubProps = await this.getGithubProps(
            user,
            projectUuid,
            quoteChar,
        );

        await GitIntegrationService.createBranch(githubProps);
        const updatedFiles = await this.updateFileForCustomMetrics({
            ...githubProps,
            customMetrics,
            projectUuid,
            quoteChar,
        });

        const customMetricInfo =
            customMetrics.length === 1
                ? `\`${customMetrics[0].name}\` custom metric`
                : `${customMetrics.length} custom metrics`;
        const pullRequest = await createPullRequest({
            ...githubProps,
            title: `Adds ${customMetricInfo}`,
            body: `Created by Lightdash, this pull request adds ${customMetricInfo} to the dbt model.

Triggered by user ${user.firstName} ${user.lastName} (${user.email})
            `,
            head: githubProps.branch,
            base: githubProps.mainBranch,
        });
        Logger.debug(
            `Successfully created pull request #${pullRequest.number} in ${githubProps.owner}/${githubProps.repo}`,
        );

        this.analytics.track({
            event: 'write_back.created',
            userId: user.userUuid,
            properties: {
                name: customMetricInfo,
                projectId: projectUuid,
                organizationId: user.organizationUuid!,
                context: QueryExecutionContext.EXPLORE,
                customMetricsCount: customMetrics.length,
            },
        });
        return {
            prTitle: pullRequest.title,
            prUrl: pullRequest.html_url,
            files: updatedFiles,
        };
    }

    private static removeExtraSlashes(str: string): string {
        return str
            .replace(/\/{2,}/g, '/') // Removes duplicated slashes
            .replace(/^\//, ''); // Remove first / if it exists, this is needed to commit files in Github.
    }

    private static getFilePath(
        path: string,
        name: string,
        extension: 'sql' | 'yml',
    ) {
        const filePath = `${path}/models/lightdash/${snakeCaseName(
            name,
        )}.${extension}`;
        return GitIntegrationService.removeExtraSlashes(filePath);
    }

    private static async createSqlFile({
        githubProps,
        name,
        sql,
    }: {
        githubProps: GithubProps;
        name: string;
        sql: string;
    }) {
        const fileName = GitIntegrationService.getFilePath(
            githubProps.path,
            name,
            'sql',
        );
        await checkFileDoesNotExist({ ...githubProps, path: fileName });
        const content = `
{{
  config(
    tags=['created-by-lightdash']
  )
}}
  
${sql}
`;

        return createFile({
            ...githubProps,
            fileName,
            content,
            message: `Created file ${fileName} `,
        });
    }

    private static async createYmlFile({
        githubProps,
        name,
        columns,
    }: {
        githubProps: GithubProps;
        name: string;
        columns: VizColumn[];
    }) {
        const fileName = GitIntegrationService.getFilePath(
            githubProps.path,
            name,
            'yml',
        );
        await checkFileDoesNotExist({ ...githubProps, path: fileName });

        const content = yaml.dump(
            {
                version: 2,
                models: [
                    {
                        name: snakeCaseName(name),
                        label: friendlyName(name),
                        description: `SQL model for ${friendlyName(name)}`,
                        columns: columns.map((c) => ({
                            name: c.reference,
                            meta: {
                                dimension: {
                                    type: c.type,
                                },
                            },
                        })),
                    },
                ],
            },
            {
                quotingType: githubProps.quoteChar,
            },
        );

        return createFile({
            ...githubProps,
            fileName,
            content,
            message: `Created file ${fileName} `,
        });
    }

    async createPullRequestFromSql(
        user: SessionUser,
        projectUuid: string,
        name: string,
        sql: string,
        columns: VizColumn[],
        quoteChar: `"` | `'` = '"',
    ): Promise<PullRequestCreated> {
        const githubProps = await this.getGithubProps(
            user,
            projectUuid,
            quoteChar,
        );
        await GitIntegrationService.createBranch(githubProps);

        await GitIntegrationService.createSqlFile({
            githubProps,
            name,
            sql,
        });
        await GitIntegrationService.createYmlFile({
            githubProps,
            name,
            columns,
        });
        Logger.debug(
            `Creating pull request from branch ${githubProps.branch} to ${githubProps.mainBranch} in ${githubProps.owner}/${githubProps.repo}`,
        );
        const pullRequest = await createPullRequest({
            ...githubProps,
            title: `Creates \`${name}\` SQL and YML model`,
            body: `Created by Lightdash, this pull request introduces a new SQL file and a corresponding Lightdash \`.yml\` configuration file.

Triggered by user ${user.firstName} ${user.lastName} (${user.email})
            `,
            head: githubProps.branch,
            base: githubProps.mainBranch,
        });
        Logger.debug(
            `Successfully created pull request #${pullRequest.number} in ${githubProps.owner}/${githubProps.repo}`,
        );

        this.analytics.track({
            event: 'write_back.created',
            userId: user.userUuid,
            properties: {
                name,
                projectId: projectUuid,
                organizationId: user.organizationUuid!,
                context: QueryExecutionContext.SQL_RUNNER,
            },
        });
        return {
            prTitle: pullRequest.title,
            prUrl: pullRequest.html_url,
        };
    }

    async writeBackPreview(
        user: SessionUser,
        projectUuid: string,
        name: string,
    ): Promise<ApiGithubDbtWritePreview['results']> {
        const { owner, repo, path } = await this.getProjectRepo(projectUuid);

        return {
            url: `https://github.com/${owner}/${repo}`,
            repo,
            path: `${path}/models/lightdash`,
            files: [
                GitIntegrationService.getFilePath(path, name, 'sql'),
                GitIntegrationService.getFilePath(path, name, 'yml'),
            ],
            owner,
        };
    }
}
