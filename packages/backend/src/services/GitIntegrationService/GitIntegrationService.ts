import {
    AdditionalMetric,
    DbtModelNode,
    DbtProjectType,
    DimensionType,
    findAndUpdateModelNodes,
    GitIntegrationConfiguration,
    isUserWithOrg,
    lightdashDbtYamlSchema,
    ParseError,
    Project,
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
    updateFile,
} from '../../clients/github/Github';
import { LightdashConfig } from '../../config/parseConfig';
import { GithubAppInstallationsModel } from '../../models/GithubAppInstallations/GithubAppInstallationsModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { ProjectService } from '../ProjectService/ProjectService';

type Dependencies = {
    lightdashConfig: LightdashConfig;
    savedChartModel: SavedChartModel;
    projectModel: ProjectModel;
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

export class GitIntegrationService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly savedChartModel: SavedChartModel;

    private readonly projectModel: ProjectModel;

    private readonly githubAppInstallationsModel: GithubAppInstallationsModel;

    constructor(deps: Dependencies) {
        this.lightdashConfig = deps.lightdashConfig;
        this.savedChartModel = deps.savedChartModel;
        this.projectModel = deps.projectModel;
        this.githubAppInstallationsModel = deps.githubAppInstallationsModel;
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
            enabled: true,
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
        console.log('schema file', schemaFile);
        if (!validate(schemaFile)) {
            throw new ParseError(`Not valid schema ${validate}`);
        }
        return schemaFile;
    }

    static async createBranch({
        owner,
        repo,
        mainBranch,
    }: {
        owner: string;
        repo: string;
        mainBranch: string;
    }): Promise<string> {
        const { sha: commitSha } = await getLastCommit({
            owner,
            repo,
            branch: mainBranch,
        });
        // create branch in git
        const branchName = `add-custom-metrics-${Date.now()}`;
        const newBranch = await createBranch({
            branchName,
            owner,
            repo,
            sha: commitSha,
        });
        return branchName;
    }

    async getPullRequestDetails({
        user,
        customMetrics,
        owner,
        repo,
        branchName,
        chart,
        projectUuid,
    }: {
        user: SessionUser;
        customMetrics: AdditionalMetric[];
        owner: string;
        repo: string;
        branchName: string;
        chart: SavedChart;
        projectUuid: string;
    }): Promise<PullRequestCreated> {
        const prTitle = `Added ${customMetrics.length} custom metrics from chart ${chart.name}`;

        // TODO should we use the api to get the link to the PR ?
        const prBody = `Created by Lightdash, this PR adds ${customMetrics.length} custom metrics to the dbt model for the chart ${chart.name}
            
Triggered by user ${user.firstName} ${user.lastName} (${user.email})

Affected charts: 
- [${chart.name}](${this.lightdashConfig.siteUrl}/projects/${projectUuid}/charts/${chart.uuid})
        `;

        const prUrl = `https://github.com/${owner}/${repo}/compare/main...${owner}:${repo}:${branchName}?expand=1&body=${encodeURIComponent(
            prBody,
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
    }: {
        user: SessionUser;
        owner: string;
        repo: string;
        projectUuid: string;
        customMetrics: AdditionalMetric[] | undefined;
        branchName: string;
    }): Promise<any> {
        if (customMetrics === undefined || customMetrics?.length === 0)
            throw new Error('No custom metrics found');
        const tables = [
            ...new Set(customMetrics.map((metric) => metric.table)),
        ];
        // throw new Error('test');

        tables.map(async (table) => {
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
                    quotingType: "'",
                },
            );

            const fileUpdated = await updateFile({
                owner,
                repo,
                fileName,
                content: updatedYml,
                fileSha,
                branchName,
                message: `Updated file ${fileName} with ${customMetricsForTable?.length} custom metrics from table ${table}`,
            });
        });
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

    async createPullRequestForChartFields(
        user: SessionUser,
        projectUuid: string,
        chartUuid: string,
    ): Promise<PullRequestCreated> {
        // TODO: check user permissions, only editors and above?

        const { owner, repo, branch } = await this.getProjectRepo(projectUuid);
        const branchName = await GitIntegrationService.createBranch({
            owner,
            repo,
            mainBranch: branch,
        });

        const chart = await this.savedChartModel.get(chartUuid);
        const customMetrics = chart.metricQuery.additionalMetrics;

        await this.updateFileForCustomMetrics({
            user,
            owner,
            customMetrics,
            repo,
            projectUuid,
            branchName,
        });

        return this.getPullRequestDetails({
            user,
            customMetrics: customMetrics || [],
            owner,
            repo,
            branchName,
            chart,
            projectUuid,
        });
    }
}
