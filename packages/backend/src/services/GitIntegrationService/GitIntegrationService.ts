/* eslint-disable no-await-in-loop */
import { subject } from '@casl/ability';
import {
    AdditionalMetric,
    ApiGithubDbtWritePreview,
    CustomDimension,
    DbtGithubProjectConfig,
    DbtGitlabProjectConfig,
    DbtProjectType,
    DbtSchemaEditor,
    DbtVersionOptionLatest,
    ForbiddenError,
    friendlyName,
    getErrorMessage,
    getLatestSupportDbtVersion,
    GitBranch,
    GitFileOrDirectory,
    GitIntegrationConfiguration,
    isUserWithOrg,
    ParameterError,
    ParseError,
    ProjectType,
    PullRequestCreated,
    QueryExecutionContext,
    SavedChart,
    SessionUser,
    snakeCaseName,
    SupportedDbtVersions,
    UnexpectedServerError,
    VizColumn,
} from '@lightdash/common';
import { nanoid } from 'nanoid';
import {
    LightdashAnalytics,
    WriteBackEvent,
} from '../../analytics/LightdashAnalytics';
import * as GithubClient from '../../clients/github/Github';
import * as GitlabClient from '../../clients/gitlab/Gitlab';
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

type GitProps = {
    owner: string;
    repo: string;
    branch: string;
    path: string;
    token: string; // Either a bot token from InstallationId or a personal access token from the project
    installationId?: string; // For github requests using the installation id as a bot
    mainBranch: string;
    quoteChar: `"` | `'`;
    hostDomain?: string; // For GitLab or GitHub Enterprise
    type: DbtProjectType.GITHUB | DbtProjectType.GITLAB;
    dbtVersion?: SupportedDbtVersions;
};

// Keep backward compatibility
type GithubProps = GitProps;

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
        return {
            enabled: !!installationId,
            installationId,
        };
    }

    static async createBranch(gitProps: GitProps) {
        const {
            owner,
            repo,
            mainBranch,
            token,
            branch,
            type,
            hostDomain,
            installationId,
        } = gitProps;

        const getLastCommit =
            type === DbtProjectType.GITHUB
                ? GithubClient.getLastCommit
                : GitlabClient.getLastCommit;
        const { sha: commitSha } = await getLastCommit({
            owner,
            repo,
            branch: mainBranch,
            installationId,
            token,
            hostDomain,
        });

        Logger.debug(
            `Creating branch ${branch} from ${mainBranch} (commit: ${commitSha}) in ${owner}/${repo}`,
        );

        const createBranch =
            type === DbtProjectType.GITHUB
                ? GithubClient.createBranch
                : GitlabClient.createBranch;

        await createBranch({
            branch,
            owner,
            repo,
            sha: commitSha,
            installationId,
            token,
            hostDomain,
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

    private async getYamlForTable({
        owner,
        repo,
        path,
        projectUuid,
        table,
        installationId,
        token,
        branch,
        type,
        hostDomain,
    }: {
        owner: string;
        repo: string;
        path: string;
        projectUuid: string;
        table: string;
        installationId?: string;
        token: string;
        branch: string;
        type: DbtProjectType.GITHUB | DbtProjectType.GITLAB;
        hostDomain?: string;
    }) {
        const explore = await this.projectModel.getExploreFromCache(
            projectUuid,
            table,
        );

        if (!explore.ymlPath)
            throw new ParameterError(
                'Your project needs to be compiled before writing back custom fields. Please refresh your project to fix this issue.',
            );

        const fileName = GitIntegrationService.removeExtraSlashes(
            `${path}/${explore.ymlPath}`,
        );

        const getFileContent =
            type === DbtProjectType.GITHUB
                ? GithubClient.getFileContent
                : GitlabClient.getFileContent;
        const { content: fileContent, sha: fileSha } = await getFileContent({
            fileName,
            owner,
            repo,
            branch,
            installationId,
            token,
            hostDomain,
        });

        // Get the dbt version from the project
        const project = await this.projectModel.get(projectUuid);
        const dbtVersion =
            project.dbtVersion === DbtVersionOptionLatest.LATEST
                ? getLatestSupportDbtVersion()
                : project.dbtVersion;

        const yamlSchema = new DbtSchemaEditor(
            fileContent,
            fileName,
            dbtVersion,
        );

        if (!yamlSchema.hasModels()) {
            throw new ParseError(`No models found in ${fileName}`);
        }

        return { yamlSchema, fileName, fileContent, fileSha };
    }

    async updateFile(
        args: GitProps &
            (
                | {
                      fieldType: 'customDimensions';
                      fields: CustomDimension[];
                  }
                | {
                      fieldType: 'customMetrics';
                      fields: AdditionalMetric[];
                  }
            ) & {
                projectUuid: string;
            },
    ): Promise<void> {
        const {
            owner,
            repo,
            path,
            projectUuid,
            installationId,
            token,
            branch,
            quoteChar,
            fields,
            fieldType,
            type: gitType,
            hostDomain,
        } = args;
        const fieldsType =
            fieldType === 'customDimensions'
                ? 'custom dimension'
                : 'custom metric';

        if (fields === undefined || fields?.length === 0)
            throw new ParameterError(`No custom ${fieldsType}s found`);
        const tables = [...new Set(fields.map((item) => item.table))];

        for (const table of tables) {
            const fieldsForTable = fields.filter(
                (item) => item.table === table,
            );
            const { yamlSchema, fileName, fileSha } =
                await this.getYamlForTable({
                    table,
                    path,
                    owner,
                    repo,
                    branch,
                    installationId,
                    token,
                    projectUuid,
                    type: gitType,
                    hostDomain,
                });

            if (!yamlSchema.hasModels()) {
                throw new ParseError(`No models found in ${fileName}`);
            }

            let updatedYml: string;
            if (fieldType === 'customDimensions') {
                const warehouseCredentials =
                    await this.projectModel.getWarehouseCredentialsForProject(
                        projectUuid,
                    );
                const warehouseClient =
                    this.projectModel.getWarehouseClientFromCredentials(
                        warehouseCredentials,
                    );
                updatedYml = yamlSchema
                    .addCustomDimensions(
                        fieldsForTable as CustomDimension[],
                        warehouseClient,
                    )
                    .toString({
                        quoteChar,
                    });
            } else if (fieldType === 'customMetrics') {
                updatedYml = yamlSchema
                    .addCustomMetrics(fieldsForTable as AdditionalMetric[])
                    .toString({
                        quoteChar,
                    });
            } else {
                throw new ParameterError(`Unknown type: ${fieldType}`);
            }

            const message = `Updated file ${fileName} with ${fieldsForTable?.length} custom ${fieldsType} from table ${table}`;

            const updateFile =
                gitType === DbtProjectType.GITHUB
                    ? GithubClient.updateFile
                    : GitlabClient.updateFile;
            await updateFile({
                owner,
                repo,
                fileName,
                content: updatedYml,
                fileSha,
                branch,
                installationId,
                token,
                hostDomain,
                message,
            });
            Logger.debug(
                `Successfully updated file ${fileName} in ${owner}/${repo} (branch: ${branch})`,
            );
        }
    }

    async getProjectRepo(projectUuid: string) {
        const project = await this.projectModel.get(projectUuid);

        if (
            ![DbtProjectType.GITHUB, DbtProjectType.GITLAB].includes(
                project.dbtConnection.type,
            )
        )
            throw new ParameterError(
                `invalid dbt connection type ${project.dbtConnection.type} for project ${project.name}`,
            );
        const connection = project.dbtConnection as
            | DbtGithubProjectConfig
            | DbtGitlabProjectConfig;
        const [owner, repo] = connection.repository.split('/');
        const { branch } = connection;
        const path = connection.project_sub_path;
        const hostDomain = connection.host_domain;
        return {
            owner,
            repo,
            branch,
            path,
            hostDomain,
            type: project.dbtConnection.type as
                | DbtProjectType.GITHUB
                | DbtProjectType.GITLAB,
        };
    }

    /**
     * Get the protected branch for a project.
     * For normal projects: the project's configured branch (e.g., "main")
     * For preview projects: the upstream project's configured branch
     */
    private async getProtectedBranch(projectUuid: string): Promise<string> {
        const project = await this.projectModel.getSummary(projectUuid);

        if (
            project.type === ProjectType.PREVIEW &&
            project.upstreamProjectUuid
        ) {
            // Preview project: protected branch is upstream's configured branch
            const upstream = await this.projectModel.get(
                project.upstreamProjectUuid,
            );
            const upstreamConnection = upstream.dbtConnection as
                | DbtGithubProjectConfig
                | DbtGitlabProjectConfig;
            return upstreamConnection.branch;
        }

        // Normal project: protected branch is this project's configured branch
        const { branch } = await this.getProjectRepo(projectUuid);
        return branch;
    }

    async getOrUpdateToken(organizationUuid: string) {
        const { token, refreshToken } =
            await this.githubAppInstallationsModel.getAuth(organizationUuid);
        const { token: newToken, refreshToken: newRefreshToken } =
            await GithubClient.getOrRefreshToken(token, refreshToken);
        if (newToken !== token) {
            await this.githubAppInstallationsModel.updateAuth(
                organizationUuid,
                newToken,
                newRefreshToken,
            );
        }
        return newToken;
    }

    /*
    Gets all the information needed to create a branch and a pull request
    - owner: The owner of the repository
    - repo: The repository name
    - branch: A unique generated branch name (eg: lightdash-johndoe-1234)
    - mainBranch: The original branch of the project (eg: main)
    - path: The path to the project (eg: lightdash/dbt)
    - token: The token to use for the Git requests, it can be either an installation token (Github integration) or a personal access token (project settings)
    - installationId: Optional, The installation id of the user
    - quoteChar: The quote character to use when replacing YML content ("" or "'")
    */
    private async getGitProps(
        user: SessionUser,
        projectUuid: string,
        quoteChar: `"` | `'`,
    ) {
        const { owner, repo, branch, path, hostDomain, type } =
            await this.getProjectRepo(projectUuid);
        let token: string = '';
        let installationId: string | undefined;

        if (type === DbtProjectType.GITHUB) {
            // GitHub logic - try app installation first, fallback to PAT
            try {
                installationId = await this.getInstallationId(user);
                token = await this.getOrUpdateToken(user.organizationUuid!);
            } catch {
                const project =
                    await this.projectModel.getWithSensitiveFields(projectUuid);
                const connection =
                    project.dbtConnection as DbtGithubProjectConfig;
                token = connection.personal_access_token || '';
                if (!token) {
                    throw new ParameterError(
                        'Invalid personal access token for GitHub project',
                    );
                }
            }
        } else if (type === DbtProjectType.GITLAB) {
            // GitLab logic - only personal access tokens supported
            const project =
                await this.projectModel.getWithSensitiveFields(projectUuid);
            const connection = project.dbtConnection as DbtGitlabProjectConfig;
            token = connection.personal_access_token || '';
            if (!token) {
                throw new ParameterError(
                    'Invalid personal access token for GitLab project',
                );
            }
        } else {
            throw new ParameterError(`Unsupported project type: ${type}`);
        }

        const userName = `${snakeCaseName(
            user.firstName[0] || '',
        )}${snakeCaseName(user.lastName)}`;
        const branchName = `lightdash-${userName}-${nanoid(4)}`;

        // Get the dbt version from the project
        const project = await this.projectModel.get(projectUuid);
        const dbtVersion =
            project.dbtVersion === DbtVersionOptionLatest.LATEST
                ? getLatestSupportDbtVersion()
                : project.dbtVersion;

        const gitProps: GitProps = {
            owner,
            repo,
            branch: branchName,
            mainBranch: branch,
            token,
            path,
            hostDomain,
            type,
            installationId,
            quoteChar,
            dbtVersion,
        };
        return gitProps;
    }

    // Keep backward compatibility
    private async getGithubProps(
        user: SessionUser,
        projectUuid: string,
        quoteChar: `"` | `'`,
    ) {
        return this.getGitProps(user, projectUuid, quoteChar);
    }

    async createPullRequest(
        user: SessionUser,
        projectUuid: string,
        quoteChar: `"` | `'`,
        args:
            | {
                  type: 'customDimensions';
                  fields: CustomDimension[];
              }
            | {
                  type: 'customMetrics';
                  fields: AdditionalMetric[];
              },
    ): Promise<PullRequestCreated> {
        const { type, fields } = args;
        const typeName =
            type === 'customDimensions' ? 'custom dimension' : 'custom metric';

        if (fields.length === 0) throw new ParseError(`Missing ${typeName}s`);

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

        const gitProps = await this.getGitProps(user, projectUuid, quoteChar);

        await GitIntegrationService.createBranch(gitProps);
        if (args.type === 'customMetrics') {
            await this.updateFile({
                ...gitProps,
                fieldType: 'customMetrics',
                fields: args.fields,
                projectUuid,
            });
        } else {
            await this.updateFile({
                ...gitProps,
                fieldType: 'customDimensions',
                fields: args.fields,
                projectUuid,
            });
        }

        const fieldsInfo =
            fields.length === 1
                ? `\`${fields[0].name}\` ${typeName}`
                : `${fields.length} ${typeName}s`;
        const eventProperties: WriteBackEvent['properties'] = {
            name: fieldsInfo,
            projectId: projectUuid,
            organizationId: user.organizationUuid!,
            context: QueryExecutionContext.EXPLORE,
        };
        try {
            const createPullRequest =
                gitProps.type === DbtProjectType.GITHUB
                    ? GithubClient.createPullRequest
                    : GitlabClient.createPullRequest;
            const pullRequest: {
                html_url: string;
                title: string;
                number: number;
            } = await createPullRequest({
                ...gitProps,
                title: `Adds ${fieldsInfo}`,
                body: `Created by Lightdash, this pull request adds ${fieldsInfo} to the dbt model.
Triggered by user ${user.firstName} ${user.lastName} (${user.email})

> ⚠️ **Note: Do not change the \`label\` or \`id\` of your ${typeName}s in this pull request.** Your ${typeName}s _will not be replaced_ with YAML ${typeName}s if you change the \`label\` or \`id\` of the ${typeName}s in this pull request. Lightdash requires the IDs and labels to match 1:1 in order to replace custom ${typeName}s with YAML ${typeName}s.`,
                head: gitProps.branch,
                base: gitProps.mainBranch,
            });

            Logger.debug(
                `Successfully created ${
                    gitProps.type === DbtProjectType.GITHUB
                        ? 'pull request'
                        : 'merge request'
                } #${pullRequest.number} in ${gitProps.owner}/${gitProps.repo}`,
            );

            this.analytics.track({
                event: 'write_back.created',
                userId: user.userUuid,
                properties: {
                    ...eventProperties,
                    [`${type}Count`]: fields.length,
                },
            });
            return {
                prTitle: pullRequest.title,
                prUrl: pullRequest.html_url,
            };
        } catch (e) {
            this.analytics.track({
                event: 'write_back.error',
                userId: user.userUuid,
                properties: {
                    ...eventProperties,
                    error: getErrorMessage(e),
                },
            });
            throw e;
        }
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
        gitProps,
        name,
        sql,
    }: {
        gitProps: GitProps;
        name: string;
        sql: string;
    }) {
        const fileName = GitIntegrationService.getFilePath(
            gitProps.path,
            name,
            'sql',
        );

        const checkFileDoesNotExist =
            gitProps.type === DbtProjectType.GITHUB
                ? GithubClient.checkFileDoesNotExist
                : GitlabClient.checkFileDoesNotExist;

        await checkFileDoesNotExist({
            ...gitProps,
            path: fileName,
        });

        const content = `
{{
  config(
    tags=['created-by-lightdash']
  )
}}
  
${sql}
`;

        const message = `Created file ${fileName} `;

        const createFile =
            gitProps.type === DbtProjectType.GITHUB
                ? GithubClient.createFile
                : GitlabClient.createFile;
        return createFile({
            ...gitProps,
            fileName,
            content,
            message,
        });
    }

    private static async createYmlFile({
        gitProps,
        name,
        columns,
    }: {
        gitProps: GitProps;
        name: string;
        columns: VizColumn[];
    }) {
        const fileName = GitIntegrationService.getFilePath(
            gitProps.path,
            name,
            'yml',
        );

        const checkFileDoesNotExist =
            gitProps.type === DbtProjectType.GITHUB
                ? GithubClient.checkFileDoesNotExist
                : GitlabClient.checkFileDoesNotExist;

        await checkFileDoesNotExist({
            ...gitProps,
            path: fileName,
        });

        const content = new DbtSchemaEditor(`version: 2`)
            .addModel({
                name: snakeCaseName(name),
                description: `SQL model for ${friendlyName(name)}`,
                meta: {
                    label: friendlyName(name),
                },
                columns: columns.map((c) => ({
                    name: c.reference,
                    meta: {
                        dimension: {
                            type: c.type,
                        },
                    },
                })),
            })
            .toString({
                quoteChar: gitProps.quoteChar,
            });

        const message = `Created file ${fileName} `;

        const createFile =
            gitProps.type === DbtProjectType.GITHUB
                ? GithubClient.createFile
                : GitlabClient.createFile;
        return createFile({
            ...gitProps,
            fileName,
            content,
            message,
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
        const gitProps = await this.getGitProps(user, projectUuid, quoteChar);
        await GitIntegrationService.createBranch(gitProps);

        await GitIntegrationService.createSqlFile({
            gitProps,
            name,
            sql,
        });
        await GitIntegrationService.createYmlFile({
            gitProps,
            name,
            columns,
        });
        Logger.debug(
            `Creating ${
                gitProps.type === DbtProjectType.GITHUB
                    ? 'pull request'
                    : 'merge request'
            } from branch ${gitProps.branch} to ${gitProps.mainBranch} in ${
                gitProps.owner
            }/${gitProps.repo}`,
        );
        const eventProperties: WriteBackEvent['properties'] = {
            name,
            projectId: projectUuid,
            organizationId: user.organizationUuid!,
            context: QueryExecutionContext.SQL_RUNNER,
        };
        try {
            const createPullRequest =
                gitProps.type === DbtProjectType.GITHUB
                    ? GithubClient.createPullRequest
                    : GitlabClient.createPullRequest;

            const pullRequest: {
                html_url: string;
                title: string;
                number: number;
            } = await createPullRequest({
                ...gitProps,
                title: `Creates \`${name}\` SQL and YML model`,
                body: `Created by Lightdash, this pull request introduces a new SQL file and a corresponding Lightdash \`.yml\` configuration file.

Triggered by user ${user.firstName} ${user.lastName} (${user.email})
        `,
                head: gitProps.branch,
                base: gitProps.mainBranch,
            });

            Logger.debug(
                `Successfully created ${
                    gitProps.type === DbtProjectType.GITHUB
                        ? 'pull request'
                        : 'merge request'
                } #${pullRequest.number} in ${gitProps.owner}/${gitProps.repo}`,
            );

            this.analytics.track({
                event: 'write_back.created',
                userId: user.userUuid,
                properties: eventProperties,
            });
            return {
                prTitle: pullRequest.title,
                prUrl: pullRequest.html_url,
            };
        } catch (e) {
            this.analytics.track({
                event: 'write_back.error',
                userId: user.userUuid,
                properties: {
                    ...eventProperties,
                    error: getErrorMessage(e),
                },
            });
            throw e;
        }
    }

    async writeBackPreview(
        user: SessionUser,
        projectUuid: string,
        name: string,
    ): Promise<ApiGithubDbtWritePreview['results']> {
        const { owner, repo, path, type, hostDomain } =
            await this.getProjectRepo(projectUuid);

        const baseUrl =
            type === DbtProjectType.GITHUB
                ? `https://github.com/${owner}/${repo}`
                : `https://${hostDomain || 'gitlab.com'}/${owner}/${repo}`;

        return {
            url: baseUrl,
            repo,
            path: `${path}/models/lightdash`,
            files: [
                GitIntegrationService.getFilePath(path, name, 'sql'),
                GitIntegrationService.getFilePath(path, name, 'yml'),
            ],
            owner,
        };
    }

    async getBranches(user: SessionUser, projectUuid: string) {
        const gitProps = await this.getGitProps(user, projectUuid, '"');

        const getBranches =
            gitProps.type === DbtProjectType.GITHUB
                ? GithubClient.getBranches
                : GitlabClient.getBranches;

        const branches: Array<{ name: string }> = await getBranches(gitProps);

        return branches.map((branch) => branch.name);
    }

    /**
     * Get the YAML file for an explore's base table
     */
    async getFileForExplore(
        user: SessionUser,
        projectUuid: string,
        exploreName: string,
    ): Promise<{ content: string; sha: string; filePath: string }> {
        if (
            user.ability.cannot(
                'view',
                subject('SourceCode', {
                    organizationUuid: user.organizationUuid!,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const explore = await this.projectModel.getExploreFromCache(
            projectUuid,
            exploreName,
        );

        if (!explore.ymlPath) {
            throw new ParameterError(
                'Your project needs to be compiled before accessing model files. Please refresh your project to fix this issue.',
            );
        }

        const { owner, repo, branch, path, type, hostDomain } =
            await this.getProjectRepo(projectUuid);

        const gitProps = await this.getGitProps(user, projectUuid, '"');

        const fullPath = GitIntegrationService.removeExtraSlashes(
            `${path}/${explore.ymlPath}`,
        );

        const getFileContent =
            type === DbtProjectType.GITHUB
                ? GithubClient.getFileContent
                : GitlabClient.getFileContent;

        const { content, sha } = await getFileContent({
            fileName: fullPath,
            owner,
            repo,
            branch,
            installationId: gitProps.installationId,
            token: gitProps.token,
            hostDomain,
        });

        this.analytics.track({
            event: 'source_code.viewed',
            userId: user.userUuid,
            properties: {
                organizationId: user.organizationUuid!,
                projectId: projectUuid,
                exploreName,
                filePath: fullPath,
                fileSize: content.length,
                gitProvider: type,
            },
        });

        return { content, sha, filePath: fullPath };
    }

    /**
     * Get the file path for an explore's YAML file (without fetching content)
     * Used for deep-linking to the source code editor
     */
    async getFilePathForExplore(
        user: SessionUser,
        projectUuid: string,
        exploreName: string,
    ): Promise<{ filePath: string }> {
        if (
            user.ability.cannot(
                'view',
                subject('SourceCode', {
                    organizationUuid: user.organizationUuid!,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const explore = await this.projectModel.getExploreFromCache(
            projectUuid,
            exploreName,
        );

        if (!explore.ymlPath) {
            throw new ParameterError(
                'Your project needs to be compiled before accessing model files. Please refresh your project to fix this issue.',
            );
        }

        const { path } = await this.getProjectRepo(projectUuid);

        const fullPath = GitIntegrationService.removeExtraSlashes(
            `${path}/${explore.ymlPath}`,
        );

        return { filePath: fullPath };
    }

    /**
     * Create a pull request with arbitrary file changes
     */
    async createPullRequestWithFileChange(
        user: SessionUser,
        projectUuid: string,
        filePath: string,
        newContent: string,
        originalSha: string,
        prTitle: string,
        prDescription: string,
    ): Promise<PullRequestCreated> {
        // PR creates its own feature branch, so always allow (isProtectedBranch: false)
        if (
            user.ability.cannot(
                'manage',
                subject('SourceCode', {
                    organizationUuid: user.organizationUuid!,
                    projectUuid,
                    isProtectedBranch: false,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const gitProps = await this.getGitProps(user, projectUuid, '"');

        // 1. Create branch
        await GitIntegrationService.createBranch(gitProps);

        Logger.debug(
            `Updating file ${filePath} on branch ${gitProps.branch} in ${gitProps.owner}/${gitProps.repo}`,
        );

        // 2. Update file on new branch
        const updateFile =
            gitProps.type === DbtProjectType.GITHUB
                ? GithubClient.updateFile
                : GitlabClient.updateFile;

        await updateFile({
            owner: gitProps.owner,
            repo: gitProps.repo,
            fileName: filePath,
            content: newContent,
            fileSha: originalSha,
            branch: gitProps.branch,
            installationId: gitProps.installationId,
            token: gitProps.token,
            hostDomain: gitProps.hostDomain,
            message: `Update ${filePath}`,
        });

        Logger.debug(
            `Creating pull request from branch ${gitProps.branch} to ${gitProps.mainBranch}`,
        );

        // 3. Create PR
        const createPullRequest =
            gitProps.type === DbtProjectType.GITHUB
                ? GithubClient.createPullRequest
                : GitlabClient.createPullRequest;

        const fullDescription = `${prDescription}

Triggered by user ${user.firstName} ${user.lastName} (${user.email})

🤖 Created with Lightdash`;

        const pullRequest = await createPullRequest({
            ...gitProps,
            title: prTitle,
            body: fullDescription,
            head: gitProps.branch,
            base: gitProps.mainBranch,
        });

        Logger.debug(
            `Successfully created pull request #${pullRequest.number} in ${gitProps.owner}/${gitProps.repo}`,
        );

        // Keep backwards compatible event for existing analytics
        this.analytics.track({
            event: 'write_back.created',
            userId: user.userUuid,
            properties: {
                name: filePath,
                projectId: projectUuid,
                organizationId: user.organizationUuid!,
                context: QueryExecutionContext.EXPLORE,
            },
        });

        // New event with additional details
        this.analytics.track({
            event: 'source_code.pull_request_created',
            userId: user.userUuid,
            properties: {
                organizationId: user.organizationUuid!,
                projectId: projectUuid,
                filePath,
                fileSize: newContent.length,
                gitProvider: gitProps.type,
            },
        });

        return {
            prTitle: pullRequest.title,
            prUrl: pullRequest.html_url,
        };
    }

    /**
     * Get git credentials for a project (without generating a new branch name)
     * This is used for read/write operations on existing branches
     */
    private async getGitCredentials(
        user: SessionUser,
        projectUuid: string,
    ): Promise<{
        owner: string;
        repo: string;
        token: string;
        installationId?: string;
        hostDomain?: string;
        type: DbtProjectType.GITHUB | DbtProjectType.GITLAB;
    }> {
        const { owner, repo, hostDomain, type } =
            await this.getProjectRepo(projectUuid);
        let token: string = '';
        let installationId: string | undefined;

        if (type === DbtProjectType.GITHUB) {
            try {
                installationId = await this.getInstallationId(user);
                token = await this.getOrUpdateToken(user.organizationUuid!);
            } catch {
                const project =
                    await this.projectModel.getWithSensitiveFields(projectUuid);
                const connection =
                    project.dbtConnection as DbtGithubProjectConfig;
                token = connection.personal_access_token || '';
                if (!token) {
                    throw new ParameterError(
                        'Invalid personal access token for GitHub project',
                    );
                }
            }
        } else if (type === DbtProjectType.GITLAB) {
            const project =
                await this.projectModel.getWithSensitiveFields(projectUuid);
            const connection = project.dbtConnection as DbtGitlabProjectConfig;
            token = connection.personal_access_token || '';
            if (!token) {
                throw new ParameterError(
                    'Invalid personal access token for GitLab project',
                );
            }
        } else {
            throw new ParameterError(`Unsupported project type: ${type}`);
        }

        return {
            owner,
            repo,
            token,
            installationId,
            hostDomain,
            type,
        };
    }

    /**
     * List branches for a project's repository with protected status
     */
    async listBranchesForProject(
        user: SessionUser,
        projectUuid: string,
    ): Promise<GitBranch[]> {
        if (
            user.ability.cannot(
                'view',
                subject('SourceCode', {
                    organizationUuid: user.organizationUuid!,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const creds = await this.getGitCredentials(user, projectUuid);

        const getBranches =
            creds.type === DbtProjectType.GITHUB
                ? GithubClient.getBranches
                : GitlabClient.getBranches;

        const branches = await getBranches({
            owner: creds.owner,
            repo: creds.repo,
            installationId: creds.installationId,
            token: creds.token,
            hostDomain: creds.hostDomain,
        });

        const protectedBranch = await this.getProtectedBranch(projectUuid);

        return branches.map(
            (branch: { name: string; protected?: boolean }) => ({
                name: branch.name,
                isProtected:
                    (branch.protected ?? false) ||
                    branch.name === protectedBranch,
            }),
        );
    }

    /**
     * Get file content or directory listing
     */
    async getFileOrDirectory(
        user: SessionUser,
        projectUuid: string,
        branch: string,
        path?: string,
    ): Promise<GitFileOrDirectory> {
        if (
            user.ability.cannot(
                'view',
                subject('SourceCode', {
                    organizationUuid: user.organizationUuid!,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const creds = await this.getGitCredentials(user, projectUuid);
        const targetPath = path || '';

        // Try to get file content first
        try {
            const getFileContent =
                creds.type === DbtProjectType.GITHUB
                    ? GithubClient.getFileContent
                    : GitlabClient.getFileContent;

            const { content, sha } = await getFileContent({
                fileName: targetPath,
                owner: creds.owner,
                repo: creds.repo,
                branch,
                installationId: creds.installationId,
                token: creds.token,
                hostDomain: creds.hostDomain,
            });

            return {
                type: 'file',
                content,
                sha,
                path: targetPath,
            };
        } catch (error) {
            // If it's not a file, try as directory
            if (error instanceof ParameterError) {
                // "Path is not a directory" error from getFileContent means it's a file
                throw error;
            }
        }

        // Try to get directory contents
        const getDirectoryContents =
            creds.type === DbtProjectType.GITHUB
                ? GithubClient.getDirectoryContents
                : GitlabClient.getDirectoryContents;

        const entries = await getDirectoryContents({
            owner: creds.owner,
            repo: creds.repo,
            branch,
            path: targetPath,
            installationId: creds.installationId,
            token: creds.token,
            hostDomain: creds.hostDomain,
        });

        return {
            type: 'directory',
            entries: entries.map((entry) => ({
                name: entry.name,
                path: entry.path,
                type: entry.type === 'dir' ? 'dir' : 'file',
                size: entry.size,
                sha: entry.sha,
            })),
        };
    }

    /**
     * Save (create or update) a file in the repository
     */
    async saveFile(
        user: SessionUser,
        projectUuid: string,
        branch: string,
        path: string,
        content: string,
        sha?: string,
        message?: string,
    ): Promise<{ sha: string; path: string }> {
        const protectedBranch = await this.getProtectedBranch(projectUuid);
        const isProtectedBranch = branch === protectedBranch;

        if (
            user.ability.cannot(
                'manage',
                subject('SourceCode', {
                    organizationUuid: user.organizationUuid!,
                    projectUuid,
                    isProtectedBranch,
                }),
            )
        ) {
            throw new ForbiddenError(
                `Cannot write to protected branch "${protectedBranch}". ` +
                    `Please use a feature branch and submit changes via pull request.`,
            );
        }

        const creds = await this.getGitCredentials(user, projectUuid);
        const commitMessage =
            message || (sha ? `Update ${path}` : `Create ${path}`);

        if (sha) {
            // Update existing file
            const updateFile =
                creds.type === DbtProjectType.GITHUB
                    ? GithubClient.updateFile
                    : GitlabClient.updateFile;

            const response = await updateFile({
                owner: creds.owner,
                repo: creds.repo,
                fileName: path,
                content,
                fileSha: sha,
                branch,
                message: commitMessage,
                installationId: creds.installationId,
                token: creds.token,
                hostDomain: creds.hostDomain,
            });

            const newSha =
                creds.type === DbtProjectType.GITHUB
                    ? (response as { data: { content: { sha: string } } }).data
                          .content.sha
                    : sha; // GitLab doesn't return new SHA in same format

            Logger.debug(
                `Successfully updated file ${path} in ${creds.owner}/${creds.repo} (branch: ${branch})`,
            );

            return { sha: newSha, path };
        }

        // Create new file
        const createFile =
            creds.type === DbtProjectType.GITHUB
                ? GithubClient.createFile
                : GitlabClient.createFile;

        const response = await createFile({
            owner: creds.owner,
            repo: creds.repo,
            fileName: path,
            content,
            branch,
            message: commitMessage,
            installationId: creds.installationId,
            token: creds.token,
            hostDomain: creds.hostDomain,
        });

        const newSha =
            creds.type === DbtProjectType.GITHUB
                ? (response as { data: { content: { sha: string } } }).data
                      .content.sha
                : ''; // GitLab returns different structure

        Logger.debug(
            `Successfully created file ${path} in ${creds.owner}/${creds.repo} (branch: ${branch})`,
        );

        return { sha: newSha, path };
    }

    /**
     * Delete a file from the repository
     */
    async deleteFileFromRepo(
        user: SessionUser,
        projectUuid: string,
        branch: string,
        path: string,
        sha: string,
        message?: string,
    ): Promise<void> {
        const protectedBranch = await this.getProtectedBranch(projectUuid);
        const isProtectedBranch = branch === protectedBranch;

        if (
            user.ability.cannot(
                'manage',
                subject('SourceCode', {
                    organizationUuid: user.organizationUuid!,
                    projectUuid,
                    isProtectedBranch,
                }),
            )
        ) {
            throw new ForbiddenError(
                `Cannot delete from protected branch "${protectedBranch}". ` +
                    `Please use a feature branch and submit changes via pull request.`,
            );
        }

        const creds = await this.getGitCredentials(user, projectUuid);
        const commitMessage = message || `Delete ${path}`;

        const deleteFile =
            creds.type === DbtProjectType.GITHUB
                ? GithubClient.deleteFile
                : GitlabClient.deleteFile;

        await deleteFile({
            owner: creds.owner,
            repo: creds.repo,
            path,
            sha,
            branch,
            message: commitMessage,
            installationId: creds.installationId,
            token: creds.token,
            hostDomain: creds.hostDomain,
        });

        Logger.debug(
            `Successfully deleted file ${path} in ${creds.owner}/${creds.repo} (branch: ${branch})`,
        );
    }

    /**
     * Create a new branch from a source branch
     */
    async createBranchFromSource(
        user: SessionUser,
        projectUuid: string,
        branchName: string,
        sourceBranch: string,
    ): Promise<GitBranch> {
        if (
            user.ability.cannot(
                'manage',
                subject('SourceCode', {
                    organizationUuid: user.organizationUuid!,
                    projectUuid,
                    isProtectedBranch: false,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const creds = await this.getGitCredentials(user, projectUuid);

        // Get the latest commit from the source branch
        const getLastCommit =
            creds.type === DbtProjectType.GITHUB
                ? GithubClient.getLastCommit
                : GitlabClient.getLastCommit;

        const { sha: commitSha } = await getLastCommit({
            owner: creds.owner,
            repo: creds.repo,
            branch: sourceBranch,
            installationId: creds.installationId,
            token: creds.token,
            hostDomain: creds.hostDomain,
        });

        Logger.debug(
            `Creating branch ${branchName} from ${sourceBranch} (commit: ${commitSha}) in ${creds.owner}/${creds.repo}`,
        );

        // Create the new branch
        const createBranch =
            creds.type === DbtProjectType.GITHUB
                ? GithubClient.createBranch
                : GitlabClient.createBranch;

        await createBranch({
            branch: branchName,
            owner: creds.owner,
            repo: creds.repo,
            sha: commitSha,
            installationId: creds.installationId,
            token: creds.token,
            hostDomain: creds.hostDomain,
        });

        Logger.debug(
            `Successfully created branch ${branchName} in ${creds.owner}/${creds.repo}`,
        );

        return {
            name: branchName,
            isProtected: false, // Newly created branches are never protected
        };
    }

    /**
     * Create a pull request from a branch to the default branch
     */
    async createPullRequestFromBranch(
        user: SessionUser,
        projectUuid: string,
        branch: string,
        title: string,
        description: string,
    ): Promise<PullRequestCreated> {
        if (
            user.ability.cannot(
                'manage',
                subject('SourceCode', {
                    organizationUuid: user.organizationUuid!,
                    projectUuid,
                    isProtectedBranch: false,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const creds = await this.getGitCredentials(user, projectUuid);
        const protectedBranch = await this.getProtectedBranch(projectUuid);

        Logger.debug(
            `Creating pull request from branch ${branch} to ${protectedBranch} in ${creds.owner}/${creds.repo}`,
        );

        const createPullRequest =
            creds.type === DbtProjectType.GITHUB
                ? GithubClient.createPullRequest
                : GitlabClient.createPullRequest;

        const fullDescription = `${description}

Triggered by user ${user.firstName} ${user.lastName} (${user.email})

🤖 Created with Lightdash`;

        const pullRequest = await createPullRequest({
            owner: creds.owner,
            repo: creds.repo,
            title,
            body: fullDescription,
            head: branch,
            base: protectedBranch,
            installationId: creds.installationId,
            token: creds.token,
        });

        Logger.debug(
            `Successfully created pull request #${pullRequest.number} in ${creds.owner}/${creds.repo}`,
        );

        this.analytics.track({
            event: 'source_code.branch_pull_request_created',
            userId: user.userUuid,
            properties: {
                organizationId: user.organizationUuid!,
                projectId: projectUuid,
                branch,
                baseBranch: protectedBranch,
                gitProvider: creds.type,
            },
        });

        return {
            prTitle: pullRequest.title,
            prUrl: pullRequest.html_url,
        };
    }
}
