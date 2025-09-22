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
    GitIntegrationConfiguration,
    isUserWithOrg,
    ParameterError,
    ParseError,
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
        const { owner, repo, mainBranch, token, branch, type, hostDomain } =
            gitProps;

        const getLastCommit =
            type === DbtProjectType.GITHUB
                ? GithubClient.getLastCommit
                : GitlabClient.getLastCommit;
        const { sha: commitSha } = await getLastCommit({
            owner,
            repo,
            branch: mainBranch,
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
        branch: string;
        token: string;
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
                const project = await this.projectModel.getWithSensitiveFields(
                    projectUuid,
                );
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
            const project = await this.projectModel.getWithSensitiveFields(
                projectUuid,
            );
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
}
