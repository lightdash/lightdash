/* eslint-disable no-await-in-loop */
import { subject } from '@casl/ability';
import {
    AdditionalMetric,
    ApiGithubDbtWritePreview,
    CustomDimension,
    DbtProjectType,
    DbtSchemaEditor,
    ForbiddenError,
    friendlyName,
    getErrorMessage,
    GitIntegrationConfiguration,
    isUserWithOrg,
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
import { nanoid } from 'nanoid';
import {
    LightdashAnalytics,
    WriteBackEvent,
} from '../../analytics/LightdashAnalytics';
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
    path: string;
    token: string; // Either a bot token from InstallationId or a personal access token from the project
    installationId?: string; // For github requests using the installation id as a bot
    mainBranch: string;
    quoteChar: `"` | `'`;
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

    static async createBranch({
        owner,
        repo,
        mainBranch,
        token,
        branch,
    }: {
        branch: string;
        owner: string;
        repo: string;
        mainBranch: string;
        token: string;
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
            token,
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
    }: {
        owner: string;
        repo: string;
        path: string;
        projectUuid: string;
        table: string;
        branch: string;
        token: string;
    }) {
        const explore = await this.projectModel.getExploreFromCache(
            projectUuid,
            table,
        );

        if (!explore.ymlPath)
            throw new Error(
                'Explore is missing path, compile the project again to fix this issue',
            );

        // Github's path cannot start with a slash
        const fileName = GitIntegrationService.removeExtraSlashes(
            `${path}/${explore.ymlPath}`,
        );
        const { content: fileContent, sha: fileSha } = await getFileContent({
            fileName,
            owner,
            repo,
            branch,
            token,
        });

        const yamlSchema = new DbtSchemaEditor(fileContent, fileName);

        if (!yamlSchema.hasModels()) {
            throw new Error(`No models found in ${fileName}`);
        }

        return { yamlSchema, fileName, fileContent, fileSha };
    }

    async updateFile({
        owner,
        repo,
        path,
        projectUuid,
        token,
        branch,
        quoteChar,
        fields,
        type,
    }: {
        owner: string;
        repo: string;
        path: string;
        projectUuid: string;
        branch: string;
        token: string;
        quoteChar?: `"` | `'`;
    } & (
        | {
              type: 'customDimensions';
              fields: CustomDimension[];
          }
        | {
              type: 'customMetrics';
              fields: AdditionalMetric[];
          }
    )): Promise<void> {
        const fieldsType =
            type === 'customDimensions' ? 'custom dimension' : 'custom metric';

        if (fields === undefined || fields?.length === 0)
            throw new Error(`No custom ${fieldsType}s found`);
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
                });

            if (!yamlSchema.hasModels()) {
                throw new Error(`No models found in ${fileName}`);
            }

            let updatedYml: string;
            if (type === 'customDimensions') {
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
            } else if (type === 'customMetrics') {
                updatedYml = yamlSchema
                    .addCustomMetrics(fieldsForTable as AdditionalMetric[])
                    .toString({
                        quoteChar,
                    });
            } else {
                throw new ParameterError(`Unknown type: ${type}`);
            }

            await updateFile({
                owner,
                repo,
                fileName,
                content: updatedYml,
                fileSha,
                branchName: branch,
                token,
                message: `Updated file ${fileName} with ${fieldsForTable?.length} custom ${fieldsType} from table ${table}`,
            });
            Logger.debug(
                `Successfully updated file ${fileName} in ${owner}/${repo} (branch: ${branch})`,
            );
        }
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
    private async getGithubProps(
        user: SessionUser,
        projectUuid: string,
        quoteChar: `"` | `'`,
    ) {
        const { owner, repo, branch, path } = await this.getProjectRepo(
            projectUuid,
        );
        let token: string = '';
        let installationId: string | undefined;
        try {
            installationId = await this.getInstallationId(user); // This should throw an error if there is no github installation
            token = await this.getOrUpdateToken(user.organizationUuid!);
        } catch {
            const project = await this.projectModel.getWithSensitiveFields(
                projectUuid,
            );
            if (project.dbtConnection.type === DbtProjectType.GITHUB) {
                token = project.dbtConnection.personal_access_token || '';
                if (!token) {
                    throw new ParameterError('Invalid personal access token');
                }
            } else {
                throw new ParameterError('No github project found');
            }
        }

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

        const githubProps = await this.getGithubProps(
            user,
            projectUuid,
            quoteChar,
        );

        await GitIntegrationService.createBranch(githubProps);
        await this.updateFile({
            ...githubProps,
            ...args,
            projectUuid,
            quoteChar,
        });

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
            const pullRequest = await createPullRequest({
                ...githubProps,
                title: `Adds ${fieldsInfo}`,
                body: `Created by Lightdash, this pull request adds ${fieldsInfo} to the dbt model.
Triggered by user ${user.firstName} ${user.lastName} (${user.email})

> ⚠️ **Note: Do not change the \`label\` or \`id\` of your ${typeName}s in this pull request.** Your ${typeName}s _will not be replaced_ with YAML ${typeName}s if you change the \`label\` or \`id\` of the ${typeName}s in this pull request. Lightdash requires the IDs and labels to match 1:1 in order to replace custom ${typeName}s with YAML ${typeName}s.`,
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
                quoteChar: githubProps.quoteChar,
            });

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
        const eventProperties: WriteBackEvent['properties'] = {
            name,
            projectId: projectUuid,
            organizationId: user.organizationUuid!,
            context: QueryExecutionContext.SQL_RUNNER,
        };
        try {
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
