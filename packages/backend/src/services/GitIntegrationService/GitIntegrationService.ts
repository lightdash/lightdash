import {
    DbtModelNode,
    DbtProjectType,
    DimensionType,
    findAndUpdateModelNodes,
    GitIntegrationConfiguration,
    isUserWithOrg,
    lightdashDbtYamlSchema,
    ParseError,
    PullRequestCreated,
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
        console.log('schema file', schemaFile);
        if (!validate(schemaFile)) {
            throw new ParseError(`Not valid schema ${validate}`);
        }
        return schemaFile;
    }

    async createPullRequestForChartFields(
        user: SessionUser,
        projectUuid: string,
        chartUuid: string,
    ): Promise<PullRequestCreated> {
        // TODO: check user permissions, only editors and above?
        // get chart -> get custom metrics
        const project = await this.projectModel.get(projectUuid);

        if (project.dbtConnection.type !== DbtProjectType.GITHUB)
            throw new Error(
                `invalid dbt connection type ${project.dbtConnection.type} for project ${project.name}`,
            );

        const [owner, repo] = project.dbtConnection.repository.split('/');
        const { branch } = project.dbtConnection;
        const chart = await this.savedChartModel.get(chartUuid);
        const customMetrics = chart.metricQuery.additionalMetrics;
        /*
        let credentials =
            await this.projectModel.getWarehouseCredentialsForProject(
                projectUuid,
            );
        const {adapter } = await ProjectService.testProjectAdapter(
            {warehouseConnection: credentials } as UpdateProject,
            user,
        )

        const { manifest } = await adapter.dbtClient.getDbtManifest();
        */

        const { sha: commitSha } = await getLastCommit({
            owner,
            repo,
            branch,
        });

        // throw new Error('test');
        const explore = await this.projectModel.getExploreFromCache(
            projectUuid,
            chart.tableName,
        );

        if (!explore.ymlPath)
            throw new Error(
                'Explore is missing path, compile the project again to fix this issue',
            );

        const fileName = explore.ymlPath;

        if (customMetrics === undefined || customMetrics?.length === 0)
            throw new Error('No custom metrics found');

        // get yml from github
        const { content: fileContent, sha: fileSha } = await getFileContent({
            fileName,
            owner,
            repo,
            branch,
        });

        const yamlSchema = await GitIntegrationService.loadYamlSchema(
            fileContent,
        );

        if (!yamlSchema.models)
            throw new Error(`Models not found ${yamlSchema}`);

        // call util function findAndUpdateModelNodes()
        const updatedModels = findAndUpdateModelNodes(
            yamlSchema.models,
            customMetrics,
        );

        // update yml
        const updatedYml = yaml.dump(
            { ...yamlSchema, models: updatedModels },
            {
                quotingType: "'",
            },
        );

        // create branch in git
        const branchName = `add-custom-metrics-${Date.now()}`;
        const newBranch = await createBranch({
            branchName,
            owner,
            repo,
            sha: commitSha,
        });
        const prTitle = `Added ${customMetrics.length} custom metrics from chart ${chart.name}`;

        console.log('update', updatedYml);
        const fileUpdated = await updateFile({
            owner,
            repo,
            fileName,
            content: updatedYml,
            fileSha,
            branchName,
            message: prTitle,
        });

        // TODO should we use the api to get the link to the PR ?
        const prUrl = `https://github.com/${owner}/${repo}/compare/main...${owner}:${repo}:${branchName}?expand=1`;
        return {
            prTitle,
            prUrl,
        };
    }
}
