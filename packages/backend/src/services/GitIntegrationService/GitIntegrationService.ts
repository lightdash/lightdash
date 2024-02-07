import {
    DbtModelNode,
    DimensionType,
    findAndUpdateModelNodes,
    GitIntegrationConfiguration,
    lightdashDbtYamlSchema,
    ParseError,
    SessionUser,
} from '@lightdash/common';
import Ajv from 'ajv';
import * as yaml from 'js-yaml';
import { get } from 'lodash';
import { getFileContent } from '../../clients/github/Github';
import { LightdashConfig } from '../../config/parseConfig';
import { SavedChartModel } from '../../models/SavedChartModel';

type Dependencies = {
    lightdashConfig: LightdashConfig;
    savedChartModel: SavedChartModel;
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

    constructor({ lightdashConfig, savedChartModel }: Dependencies) {
        this.lightdashConfig = lightdashConfig;
        this.savedChartModel = savedChartModel;
    }

    async getConfiguration(
        user: SessionUser,
        projectUuid: string,
    ): Promise<GitIntegrationConfiguration> {
        // to remove
        console.log(this.lightdashConfig);
        // TODO: check if git integration is enabled
        const configuration = {
            enabled: true,
        };
        return configuration;
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
    ): Promise<any> {
        // TODO: check user permissions, only editors and above?
        // get chart -> get custom metrics

        console.log('chartUuid', chartUuid);

        const chart = await this.savedChartModel.get(chartUuid);
        const customMetrics = chart.metricQuery.additionalMetrics;

        if (customMetrics === undefined || customMetrics?.length === 0)
            throw new Error('No custom metrics found');
        console.log('customMetrics', customMetrics);

        // get yml from github
        const fileContent = await getFileContent('models/schema.yml'); // TODO hardcoded: replace with the right file
        console.log('fileContent', fileContent);

        const fileYaml = yaml.load(fileContent);
        console.log('fileYaml', fileYaml);
        const yamlSchema = await GitIntegrationService.loadYamlSchema(
            fileContent,
        );

        console.log('nodes', yamlSchema);

        // call util function findAndUpdateModelNodes()
        // update yml
        // create PR
        if (!yamlSchema.models)
            throw new Error(`Models not found ${yamlSchema}`);
        const updatedModels = findAndUpdateModelNodes(
            yamlSchema.models,
            customMetrics,
        );
        // to remove
        console.log('updatedModels', updatedModels);

        const results = {
            prTitle: '',
            prUrl: '',
        };
        return updatedModels;
    }
}
