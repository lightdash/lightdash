/* tslint:disable */
/* eslint-disable */
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import {
    Controller,
    fetchMiddlewares,
    FieldErrors,
    HttpStatusCodeLiteral,
    TsoaResponse,
    TsoaRoute,
    ValidateError,
    ValidationService,
} from '@tsoa/runtime';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { DbtCloudIntegrationController } from './../controllers/dbtCloudIntegrationController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { OrganizationController } from './../controllers/organizationController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { SchedulerController } from './../controllers/schedulerController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ShareController } from './../controllers/shareController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import type { RequestHandler } from 'express';
import * as express from 'express';
import { SlackController } from './../controllers/slackController';

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

const models: TsoaRoute.Models = {
    ApiErrorPayload: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                error: {
                    dataType: 'nestedObjectLiteral',
                    nestedProperties: {
                        data: { dataType: 'any' },
                        message: { dataType: 'string' },
                        name: { dataType: 'string', required: true },
                        statusCode: { dataType: 'double', required: true },
                    },
                    required: true,
                },
                status: { dataType: 'enum', enums: ['error'], required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'Pick_CreateDbtCloudIntegration.metricsJobId_': {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                metricsJobId: { dataType: 'string', required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    DbtCloudIntegration: {
        dataType: 'refAlias',
        type: {
            ref: 'Pick_CreateDbtCloudIntegration.metricsJobId_',
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    ApiDbtCloudIntegrationSettings: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                results: {
                    dataType: 'union',
                    subSchemas: [
                        { ref: 'DbtCloudIntegration' },
                        { dataType: 'undefined' },
                    ],
                    required: true,
                },
                status: { dataType: 'enum', enums: ['ok'], required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    ApiDbtCloudSettingsDeleteSuccess: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                results: { dataType: 'undefined', required: true },
                status: { dataType: 'enum', enums: ['ok'], required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    DbtCloudMetric: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                label: { dataType: 'string', required: true },
                timeGrains: {
                    dataType: 'array',
                    array: { dataType: 'string' },
                    required: true,
                },
                description: { dataType: 'string', required: true },
                dimensions: {
                    dataType: 'array',
                    array: { dataType: 'string' },
                    required: true,
                },
                name: { dataType: 'string', required: true },
                uniqueId: { dataType: 'string', required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    DbtCloudMetadataResponseMetrics: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                metrics: {
                    dataType: 'array',
                    array: { dataType: 'refAlias', ref: 'DbtCloudMetric' },
                    required: true,
                },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    ApiDbtCloudMetrics: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                results: {
                    ref: 'DbtCloudMetadataResponseMetrics',
                    required: true,
                },
                status: { dataType: 'enum', enums: ['ok'], required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    Organisation: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                needsProject: { dataType: 'boolean' },
                chartColors: {
                    dataType: 'array',
                    array: { dataType: 'string' },
                },
                allowedEmailDomains: {
                    dataType: 'array',
                    array: { dataType: 'string' },
                    required: true,
                },
                name: { dataType: 'string', required: true },
                organizationUuid: { dataType: 'string', required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    ApiOrganization: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                results: { ref: 'Organisation', required: true },
                status: { dataType: 'enum', enums: ['ok'], required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    ApiSuccessEmpty: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                results: { dataType: 'undefined', required: true },
                status: { dataType: 'enum', enums: ['ok'], required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'Partial_Omit_Organisation.organizationUuid-or-needsProject__': {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                name: { dataType: 'string' },
                allowedEmailDomains: {
                    dataType: 'array',
                    array: { dataType: 'string' },
                },
                chartColors: {
                    dataType: 'array',
                    array: { dataType: 'string' },
                },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    UpdateOrganization: {
        dataType: 'refAlias',
        type: {
            ref: 'Partial_Omit_Organisation.organizationUuid-or-needsProject__',
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    ProjectType: {
        dataType: 'refEnum',
        enums: ['DEFAULT', 'PREVIEW'],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    OrganizationProject: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                type: { ref: 'ProjectType', required: true },
                name: { dataType: 'string', required: true },
                projectUuid: { dataType: 'string', required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    ApiOrganizationProjects: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                results: {
                    dataType: 'array',
                    array: { dataType: 'refAlias', ref: 'OrganizationProject' },
                    required: true,
                },
                status: { dataType: 'enum', enums: ['ok'], required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    ApiJobResponse: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                results: {
                    dataType: 'nestedObjectLiteral',
                    nestedProperties: {
                        jobUuid: { dataType: 'string', required: true },
                    },
                    required: true,
                },
                status: { dataType: 'enum', enums: ['ok'], required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'DbtProjectType.DBT': {
        dataType: 'refEnum',
        enums: ['dbt'],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    DbtProjectEnvironmentVariable: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                value: { dataType: 'string', required: true },
                key: { dataType: 'string', required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    DbtProjectType: {
        dataType: 'refEnum',
        enums: [
            'dbt',
            'dbt_cloud_ide',
            'github',
            'gitlab',
            'bitbucket',
            'azure_devops',
            'none',
        ],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    DbtLocalProjectConfig: {
        dataType: 'refObject',
        properties: {
            type: { ref: 'DbtProjectType.DBT', required: true },
            target: { dataType: 'string' },
            environment: {
                dataType: 'array',
                array: {
                    dataType: 'refAlias',
                    ref: 'DbtProjectEnvironmentVariable',
                },
            },
            profiles_dir: { dataType: 'string' },
            project_dir: { dataType: 'string' },
        },
        additionalProperties: false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'DbtProjectType.DBT_CLOUD_IDE': {
        dataType: 'refEnum',
        enums: ['dbt_cloud_ide'],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    DbtCloudIDEProjectConfig: {
        dataType: 'refObject',
        properties: {
            type: { ref: 'DbtProjectType.DBT_CLOUD_IDE', required: true },
            api_key: { dataType: 'string', required: true },
            account_id: {
                dataType: 'union',
                subSchemas: [{ dataType: 'string' }, { dataType: 'double' }],
                required: true,
            },
            environment_id: {
                dataType: 'union',
                subSchemas: [{ dataType: 'string' }, { dataType: 'double' }],
                required: true,
            },
            project_id: {
                dataType: 'union',
                subSchemas: [{ dataType: 'string' }, { dataType: 'double' }],
                required: true,
            },
        },
        additionalProperties: false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'DbtProjectType.GITHUB': {
        dataType: 'refEnum',
        enums: ['github'],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    DbtGithubProjectConfig: {
        dataType: 'refObject',
        properties: {
            type: { ref: 'DbtProjectType.GITHUB', required: true },
            target: { dataType: 'string' },
            environment: {
                dataType: 'array',
                array: {
                    dataType: 'refAlias',
                    ref: 'DbtProjectEnvironmentVariable',
                },
            },
            personal_access_token: { dataType: 'string', required: true },
            repository: { dataType: 'string', required: true },
            branch: { dataType: 'string', required: true },
            project_sub_path: { dataType: 'string', required: true },
            host_domain: { dataType: 'string' },
        },
        additionalProperties: false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'DbtProjectType.BITBUCKET': {
        dataType: 'refEnum',
        enums: ['bitbucket'],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    DbtBitBucketProjectConfig: {
        dataType: 'refObject',
        properties: {
            type: { ref: 'DbtProjectType.BITBUCKET', required: true },
            target: { dataType: 'string' },
            environment: {
                dataType: 'array',
                array: {
                    dataType: 'refAlias',
                    ref: 'DbtProjectEnvironmentVariable',
                },
            },
            username: { dataType: 'string', required: true },
            personal_access_token: { dataType: 'string', required: true },
            repository: { dataType: 'string', required: true },
            branch: { dataType: 'string', required: true },
            project_sub_path: { dataType: 'string', required: true },
            host_domain: { dataType: 'string' },
        },
        additionalProperties: false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'DbtProjectType.GITLAB': {
        dataType: 'refEnum',
        enums: ['gitlab'],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    DbtGitlabProjectConfig: {
        dataType: 'refObject',
        properties: {
            type: { ref: 'DbtProjectType.GITLAB', required: true },
            target: { dataType: 'string' },
            environment: {
                dataType: 'array',
                array: {
                    dataType: 'refAlias',
                    ref: 'DbtProjectEnvironmentVariable',
                },
            },
            personal_access_token: { dataType: 'string', required: true },
            repository: { dataType: 'string', required: true },
            branch: { dataType: 'string', required: true },
            project_sub_path: { dataType: 'string', required: true },
            host_domain: { dataType: 'string' },
        },
        additionalProperties: false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'DbtProjectType.AZURE_DEVOPS': {
        dataType: 'refEnum',
        enums: ['azure_devops'],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    DbtAzureDevOpsProjectConfig: {
        dataType: 'refObject',
        properties: {
            type: { ref: 'DbtProjectType.AZURE_DEVOPS', required: true },
            target: { dataType: 'string' },
            environment: {
                dataType: 'array',
                array: {
                    dataType: 'refAlias',
                    ref: 'DbtProjectEnvironmentVariable',
                },
            },
            personal_access_token: { dataType: 'string', required: true },
            organization: { dataType: 'string', required: true },
            project: { dataType: 'string', required: true },
            repository: { dataType: 'string', required: true },
            branch: { dataType: 'string', required: true },
            project_sub_path: { dataType: 'string', required: true },
        },
        additionalProperties: false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'DbtProjectType.NONE': {
        dataType: 'refEnum',
        enums: ['none'],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    DbtNoneProjectConfig: {
        dataType: 'refObject',
        properties: {
            type: { ref: 'DbtProjectType.NONE', required: true },
            target: { dataType: 'string' },
            environment: {
                dataType: 'array',
                array: {
                    dataType: 'refAlias',
                    ref: 'DbtProjectEnvironmentVariable',
                },
            },
            hideRefreshButton: { dataType: 'boolean' },
        },
        additionalProperties: false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    DbtProjectConfig: {
        dataType: 'refAlias',
        type: {
            dataType: 'union',
            subSchemas: [
                { ref: 'DbtLocalProjectConfig' },
                { ref: 'DbtCloudIDEProjectConfig' },
                { ref: 'DbtGithubProjectConfig' },
                { ref: 'DbtBitBucketProjectConfig' },
                { ref: 'DbtGitlabProjectConfig' },
                { ref: 'DbtAzureDevOpsProjectConfig' },
                { ref: 'DbtNoneProjectConfig' },
            ],
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'WarehouseTypes.SNOWFLAKE': {
        dataType: 'refEnum',
        enums: ['snowflake'],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    WeekDay: {
        dataType: 'refEnum',
        enums: [0, 1, 2, 3, 4, 5, 6],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'Pick_CreateSnowflakeCredentials.Exclude_keyofCreateSnowflakeCredentials.SensitiveCredentialsFieldNames__':
        {
            dataType: 'refAlias',
            type: {
                dataType: 'nestedObjectLiteral',
                nestedProperties: {
                    type: { ref: 'WarehouseTypes.SNOWFLAKE', required: true },
                    account: { dataType: 'string', required: true },
                    role: { dataType: 'string' },
                    database: { dataType: 'string', required: true },
                    warehouse: { dataType: 'string', required: true },
                    schema: { dataType: 'string', required: true },
                    threads: { dataType: 'double' },
                    clientSessionKeepAlive: { dataType: 'boolean' },
                    queryTag: { dataType: 'string' },
                    accessUrl: { dataType: 'string' },
                    startOfWeek: {
                        dataType: 'union',
                        subSchemas: [
                            { ref: 'WeekDay' },
                            { dataType: 'enum', enums: [null] },
                        ],
                    },
                },
                validators: {},
            },
        },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'Omit_CreateSnowflakeCredentials.SensitiveCredentialsFieldNames_': {
        dataType: 'refAlias',
        type: {
            ref: 'Pick_CreateSnowflakeCredentials.Exclude_keyofCreateSnowflakeCredentials.SensitiveCredentialsFieldNames__',
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    SnowflakeCredentials: {
        dataType: 'refAlias',
        type: {
            ref: 'Omit_CreateSnowflakeCredentials.SensitiveCredentialsFieldNames_',
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'WarehouseTypes.REDSHIFT': {
        dataType: 'refEnum',
        enums: ['redshift'],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'Pick_CreateRedshiftCredentials.Exclude_keyofCreateRedshiftCredentials.SensitiveCredentialsFieldNames__':
        {
            dataType: 'refAlias',
            type: {
                dataType: 'nestedObjectLiteral',
                nestedProperties: {
                    type: { ref: 'WarehouseTypes.REDSHIFT', required: true },
                    schema: { dataType: 'string', required: true },
                    threads: { dataType: 'double' },
                    startOfWeek: {
                        dataType: 'union',
                        subSchemas: [
                            { ref: 'WeekDay' },
                            { dataType: 'enum', enums: [null] },
                        ],
                    },
                    host: { dataType: 'string', required: true },
                    port: { dataType: 'double', required: true },
                    dbname: { dataType: 'string', required: true },
                    keepalivesIdle: { dataType: 'double' },
                    sslmode: { dataType: 'string' },
                    ra3Node: { dataType: 'boolean' },
                },
                validators: {},
            },
        },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'Omit_CreateRedshiftCredentials.SensitiveCredentialsFieldNames_': {
        dataType: 'refAlias',
        type: {
            ref: 'Pick_CreateRedshiftCredentials.Exclude_keyofCreateRedshiftCredentials.SensitiveCredentialsFieldNames__',
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    RedshiftCredentials: {
        dataType: 'refAlias',
        type: {
            ref: 'Omit_CreateRedshiftCredentials.SensitiveCredentialsFieldNames_',
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'WarehouseTypes.POSTGRES': {
        dataType: 'refEnum',
        enums: ['postgres'],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'Pick_CreatePostgresCredentials.Exclude_keyofCreatePostgresCredentials.SensitiveCredentialsFieldNames__':
        {
            dataType: 'refAlias',
            type: {
                dataType: 'nestedObjectLiteral',
                nestedProperties: {
                    type: { ref: 'WarehouseTypes.POSTGRES', required: true },
                    role: { dataType: 'string' },
                    schema: { dataType: 'string', required: true },
                    threads: { dataType: 'double' },
                    startOfWeek: {
                        dataType: 'union',
                        subSchemas: [
                            { ref: 'WeekDay' },
                            { dataType: 'enum', enums: [null] },
                        ],
                    },
                    host: { dataType: 'string', required: true },
                    port: { dataType: 'double', required: true },
                    dbname: { dataType: 'string', required: true },
                    keepalivesIdle: { dataType: 'double' },
                    sslmode: { dataType: 'string' },
                    searchPath: { dataType: 'string' },
                },
                validators: {},
            },
        },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'Omit_CreatePostgresCredentials.SensitiveCredentialsFieldNames_': {
        dataType: 'refAlias',
        type: {
            ref: 'Pick_CreatePostgresCredentials.Exclude_keyofCreatePostgresCredentials.SensitiveCredentialsFieldNames__',
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    PostgresCredentials: {
        dataType: 'refAlias',
        type: {
            ref: 'Omit_CreatePostgresCredentials.SensitiveCredentialsFieldNames_',
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'WarehouseTypes.BIGQUERY': {
        dataType: 'refEnum',
        enums: ['bigquery'],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'Pick_CreateBigqueryCredentials.Exclude_keyofCreateBigqueryCredentials.SensitiveCredentialsFieldNames__':
        {
            dataType: 'refAlias',
            type: {
                dataType: 'nestedObjectLiteral',
                nestedProperties: {
                    type: { ref: 'WarehouseTypes.BIGQUERY', required: true },
                    threads: { dataType: 'double' },
                    startOfWeek: {
                        dataType: 'union',
                        subSchemas: [
                            { ref: 'WeekDay' },
                            { dataType: 'enum', enums: [null] },
                        ],
                    },
                    project: { dataType: 'string', required: true },
                    dataset: { dataType: 'string', required: true },
                    timeoutSeconds: {
                        dataType: 'union',
                        subSchemas: [
                            { dataType: 'double' },
                            { dataType: 'undefined' },
                        ],
                        required: true,
                    },
                    priority: {
                        dataType: 'union',
                        subSchemas: [
                            { dataType: 'enum', enums: ['interactive'] },
                            { dataType: 'enum', enums: ['batch'] },
                            { dataType: 'undefined' },
                        ],
                        required: true,
                    },
                    retries: {
                        dataType: 'union',
                        subSchemas: [
                            { dataType: 'double' },
                            { dataType: 'undefined' },
                        ],
                        required: true,
                    },
                    location: {
                        dataType: 'union',
                        subSchemas: [
                            { dataType: 'string' },
                            { dataType: 'undefined' },
                        ],
                        required: true,
                    },
                    maximumBytesBilled: {
                        dataType: 'union',
                        subSchemas: [
                            { dataType: 'double' },
                            { dataType: 'undefined' },
                        ],
                        required: true,
                    },
                },
                validators: {},
            },
        },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'Omit_CreateBigqueryCredentials.SensitiveCredentialsFieldNames_': {
        dataType: 'refAlias',
        type: {
            ref: 'Pick_CreateBigqueryCredentials.Exclude_keyofCreateBigqueryCredentials.SensitiveCredentialsFieldNames__',
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    BigqueryCredentials: {
        dataType: 'refAlias',
        type: {
            ref: 'Omit_CreateBigqueryCredentials.SensitiveCredentialsFieldNames_',
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'WarehouseTypes.DATABRICKS': {
        dataType: 'refEnum',
        enums: ['databricks'],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'Pick_CreateDatabricksCredentials.Exclude_keyofCreateDatabricksCredentials.SensitiveCredentialsFieldNames__':
        {
            dataType: 'refAlias',
            type: {
                dataType: 'nestedObjectLiteral',
                nestedProperties: {
                    type: { ref: 'WarehouseTypes.DATABRICKS', required: true },
                    database: { dataType: 'string', required: true },
                    startOfWeek: {
                        dataType: 'union',
                        subSchemas: [
                            { ref: 'WeekDay' },
                            { dataType: 'enum', enums: [null] },
                        ],
                    },
                    catalog: { dataType: 'string' },
                    serverHostName: { dataType: 'string', required: true },
                    httpPath: { dataType: 'string', required: true },
                },
                validators: {},
            },
        },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'Omit_CreateDatabricksCredentials.SensitiveCredentialsFieldNames_': {
        dataType: 'refAlias',
        type: {
            ref: 'Pick_CreateDatabricksCredentials.Exclude_keyofCreateDatabricksCredentials.SensitiveCredentialsFieldNames__',
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    DatabricksCredentials: {
        dataType: 'refAlias',
        type: {
            ref: 'Omit_CreateDatabricksCredentials.SensitiveCredentialsFieldNames_',
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'WarehouseTypes.TRINO': {
        dataType: 'refEnum',
        enums: ['trino'],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'Pick_CreateTrinoCredentials.Exclude_keyofCreateTrinoCredentials.SensitiveCredentialsFieldNames__':
        {
            dataType: 'refAlias',
            type: {
                dataType: 'nestedObjectLiteral',
                nestedProperties: {
                    type: { ref: 'WarehouseTypes.TRINO', required: true },
                    schema: { dataType: 'string', required: true },
                    startOfWeek: {
                        dataType: 'union',
                        subSchemas: [
                            { ref: 'WeekDay' },
                            { dataType: 'enum', enums: [null] },
                        ],
                    },
                    host: { dataType: 'string', required: true },
                    port: { dataType: 'double', required: true },
                    dbname: { dataType: 'string', required: true },
                    http_scheme: { dataType: 'string', required: true },
                },
                validators: {},
            },
        },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'Omit_CreateTrinoCredentials.SensitiveCredentialsFieldNames_': {
        dataType: 'refAlias',
        type: {
            ref: 'Pick_CreateTrinoCredentials.Exclude_keyofCreateTrinoCredentials.SensitiveCredentialsFieldNames__',
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    TrinoCredentials: {
        dataType: 'refAlias',
        type: {
            ref: 'Omit_CreateTrinoCredentials.SensitiveCredentialsFieldNames_',
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    WarehouseCredentials: {
        dataType: 'refAlias',
        type: {
            dataType: 'union',
            subSchemas: [
                { ref: 'SnowflakeCredentials' },
                { ref: 'RedshiftCredentials' },
                { ref: 'PostgresCredentials' },
                { ref: 'BigqueryCredentials' },
                { ref: 'DatabricksCredentials' },
                { ref: 'TrinoCredentials' },
            ],
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'Pick_Project.Exclude_keyofProject.projectUuid-or-organizationUuid__': {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                name: { dataType: 'string', required: true },
                type: { ref: 'ProjectType', required: true },
                dbtConnection: { ref: 'DbtProjectConfig', required: true },
                warehouseConnection: { ref: 'WarehouseCredentials' },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'Omit_Project.projectUuid-or-organizationUuid_': {
        dataType: 'refAlias',
        type: {
            ref: 'Pick_Project.Exclude_keyofProject.projectUuid-or-organizationUuid__',
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    CreateRedshiftCredentials: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                startOfWeek: {
                    dataType: 'union',
                    subSchemas: [
                        { ref: 'WeekDay' },
                        { dataType: 'enum', enums: [null] },
                    ],
                },
                ra3Node: { dataType: 'boolean' },
                sslmode: { dataType: 'string' },
                keepalivesIdle: { dataType: 'double' },
                threads: { dataType: 'double' },
                schema: { dataType: 'string', required: true },
                dbname: { dataType: 'string', required: true },
                port: { dataType: 'double', required: true },
                password: { dataType: 'string', required: true },
                user: { dataType: 'string', required: true },
                host: { dataType: 'string', required: true },
                type: { ref: 'WarehouseTypes.REDSHIFT', required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'Record_string.string_': {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {},
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    CreateBigqueryCredentials: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                startOfWeek: {
                    dataType: 'union',
                    subSchemas: [
                        { ref: 'WeekDay' },
                        { dataType: 'enum', enums: [null] },
                    ],
                },
                maximumBytesBilled: {
                    dataType: 'union',
                    subSchemas: [
                        { dataType: 'double' },
                        { dataType: 'undefined' },
                    ],
                    required: true,
                },
                location: {
                    dataType: 'union',
                    subSchemas: [
                        { dataType: 'string' },
                        { dataType: 'undefined' },
                    ],
                    required: true,
                },
                retries: {
                    dataType: 'union',
                    subSchemas: [
                        { dataType: 'double' },
                        { dataType: 'undefined' },
                    ],
                    required: true,
                },
                keyfileContents: {
                    ref: 'Record_string.string_',
                    required: true,
                },
                priority: {
                    dataType: 'union',
                    subSchemas: [
                        { dataType: 'enum', enums: ['interactive'] },
                        { dataType: 'enum', enums: ['batch'] },
                        { dataType: 'undefined' },
                    ],
                    required: true,
                },
                timeoutSeconds: {
                    dataType: 'union',
                    subSchemas: [
                        { dataType: 'double' },
                        { dataType: 'undefined' },
                    ],
                    required: true,
                },
                threads: { dataType: 'double' },
                dataset: { dataType: 'string', required: true },
                project: { dataType: 'string', required: true },
                type: { ref: 'WarehouseTypes.BIGQUERY', required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    CreatePostgresCredentials: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                startOfWeek: {
                    dataType: 'union',
                    subSchemas: [
                        { ref: 'WeekDay' },
                        { dataType: 'enum', enums: [null] },
                    ],
                },
                sslmode: { dataType: 'string' },
                role: { dataType: 'string' },
                searchPath: { dataType: 'string' },
                keepalivesIdle: { dataType: 'double' },
                threads: { dataType: 'double' },
                schema: { dataType: 'string', required: true },
                dbname: { dataType: 'string', required: true },
                port: { dataType: 'double', required: true },
                password: { dataType: 'string', required: true },
                user: { dataType: 'string', required: true },
                host: { dataType: 'string', required: true },
                type: { ref: 'WarehouseTypes.POSTGRES', required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    CreateSnowflakeCredentials: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                startOfWeek: {
                    dataType: 'union',
                    subSchemas: [
                        { ref: 'WeekDay' },
                        { dataType: 'enum', enums: [null] },
                    ],
                },
                accessUrl: { dataType: 'string' },
                queryTag: { dataType: 'string' },
                clientSessionKeepAlive: { dataType: 'boolean' },
                threads: { dataType: 'double' },
                schema: { dataType: 'string', required: true },
                warehouse: { dataType: 'string', required: true },
                database: { dataType: 'string', required: true },
                role: { dataType: 'string' },
                privateKeyPass: { dataType: 'string' },
                privateKey: { dataType: 'string' },
                password: { dataType: 'string' },
                user: { dataType: 'string', required: true },
                account: { dataType: 'string', required: true },
                type: { ref: 'WarehouseTypes.SNOWFLAKE', required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    CreateDatabricksCredentials: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                startOfWeek: {
                    dataType: 'union',
                    subSchemas: [
                        { ref: 'WeekDay' },
                        { dataType: 'enum', enums: [null] },
                    ],
                },
                personalAccessToken: { dataType: 'string', required: true },
                httpPath: { dataType: 'string', required: true },
                serverHostName: { dataType: 'string', required: true },
                database: { dataType: 'string', required: true },
                catalog: { dataType: 'string' },
                type: { ref: 'WarehouseTypes.DATABRICKS', required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    CreateTrinoCredentials: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                startOfWeek: {
                    dataType: 'union',
                    subSchemas: [
                        { ref: 'WeekDay' },
                        { dataType: 'enum', enums: [null] },
                    ],
                },
                http_scheme: { dataType: 'string', required: true },
                schema: { dataType: 'string', required: true },
                dbname: { dataType: 'string', required: true },
                port: { dataType: 'double', required: true },
                password: { dataType: 'string', required: true },
                user: { dataType: 'string', required: true },
                host: { dataType: 'string', required: true },
                type: { ref: 'WarehouseTypes.TRINO', required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    CreateWarehouseCredentials: {
        dataType: 'refAlias',
        type: {
            dataType: 'union',
            subSchemas: [
                { ref: 'CreateRedshiftCredentials' },
                { ref: 'CreateBigqueryCredentials' },
                { ref: 'CreatePostgresCredentials' },
                { ref: 'CreateSnowflakeCredentials' },
                { ref: 'CreateDatabricksCredentials' },
                { ref: 'CreateTrinoCredentials' },
            ],
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    CreateProject: {
        dataType: 'refAlias',
        type: {
            dataType: 'intersection',
            subSchemas: [
                { ref: 'Omit_Project.projectUuid-or-organizationUuid_' },
                {
                    dataType: 'nestedObjectLiteral',
                    nestedProperties: {
                        warehouseConnection: {
                            ref: 'CreateWarehouseCredentials',
                            required: true,
                        },
                    },
                },
            ],
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    RequestMethod: {
        dataType: 'refEnum',
        enums: ['CLI', 'CLI_CI', 'WEB_APP', 'UNKNOWN'],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    Project: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                warehouseConnection: { ref: 'WarehouseCredentials' },
                dbtConnection: { ref: 'DbtProjectConfig', required: true },
                type: { ref: 'ProjectType', required: true },
                name: { dataType: 'string', required: true },
                projectUuid: { dataType: 'string', required: true },
                organizationUuid: { dataType: 'string', required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    ApiProjectResponse: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                results: { ref: 'Project', required: true },
                status: { dataType: 'enum', enums: ['ok'], required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    OrganizationMemberRole: {
        dataType: 'refEnum',
        enums: ['member', 'viewer', 'editor', 'admin'],
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    OrganizationMemberProfile: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                isInviteExpired: { dataType: 'boolean' },
                isActive: { dataType: 'boolean', required: true },
                role: { ref: 'OrganizationMemberRole', required: true },
                organizationUuid: { dataType: 'string', required: true },
                email: { dataType: 'string', required: true },
                lastName: { dataType: 'string', required: true },
                firstName: { dataType: 'string', required: true },
                userUuid: { dataType: 'string', required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    ApiOrganizationMemberProfiles: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                results: {
                    dataType: 'array',
                    array: {
                        dataType: 'refAlias',
                        ref: 'OrganizationMemberProfile',
                    },
                    required: true,
                },
                status: { dataType: 'enum', enums: ['ok'], required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    ApiOrganizationMemberProfile: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                results: { ref: 'OrganizationMemberProfile', required: true },
                status: { dataType: 'enum', enums: ['ok'], required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'Partial_Pick_OrganizationMemberProfile.role__': {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: { role: { ref: 'OrganizationMemberRole' } },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    OrganizationMemberProfileUpdate: {
        dataType: 'refAlias',
        type: {
            ref: 'Partial_Pick_OrganizationMemberProfile.role__',
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    OnboardingStatus: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                ranQuery: { dataType: 'boolean', required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    ApiOnboardingStatusResponse: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                results: { ref: 'OnboardingStatus', required: true },
                status: { dataType: 'enum', enums: ['ok'], required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    SchedulerBase: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                dashboardUuid: {
                    dataType: 'union',
                    subSchemas: [
                        { dataType: 'string' },
                        { dataType: 'enum', enums: [null] },
                    ],
                    required: true,
                },
                savedChartUuid: {
                    dataType: 'union',
                    subSchemas: [
                        { dataType: 'string' },
                        { dataType: 'enum', enums: [null] },
                    ],
                    required: true,
                },
                cron: { dataType: 'string', required: true },
                createdBy: { dataType: 'string', required: true },
                updatedAt: { dataType: 'datetime', required: true },
                createdAt: { dataType: 'datetime', required: true },
                name: { dataType: 'string', required: true },
                schedulerUuid: { dataType: 'string', required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    ChartScheduler: {
        dataType: 'refAlias',
        type: {
            dataType: 'intersection',
            subSchemas: [
                { ref: 'SchedulerBase' },
                {
                    dataType: 'nestedObjectLiteral',
                    nestedProperties: {
                        dashboardUuid: {
                            dataType: 'enum',
                            enums: [null],
                            required: true,
                        },
                        savedChartUuid: { dataType: 'string', required: true },
                    },
                },
            ],
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    DashboardScheduler: {
        dataType: 'refAlias',
        type: {
            dataType: 'intersection',
            subSchemas: [
                { ref: 'SchedulerBase' },
                {
                    dataType: 'nestedObjectLiteral',
                    nestedProperties: {
                        dashboardUuid: { dataType: 'string', required: true },
                        savedChartUuid: {
                            dataType: 'enum',
                            enums: [null],
                            required: true,
                        },
                    },
                },
            ],
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    Scheduler: {
        dataType: 'refAlias',
        type: {
            dataType: 'union',
            subSchemas: [
                { ref: 'ChartScheduler' },
                { ref: 'DashboardScheduler' },
            ],
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    SchedulerSlackTarget: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                channel: { dataType: 'string', required: true },
                schedulerUuid: { dataType: 'string', required: true },
                updatedAt: { dataType: 'datetime', required: true },
                createdAt: { dataType: 'datetime', required: true },
                schedulerSlackTargetUuid: {
                    dataType: 'string',
                    required: true,
                },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    SchedulerEmailTarget: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                recipient: { dataType: 'string', required: true },
                schedulerUuid: { dataType: 'string', required: true },
                updatedAt: { dataType: 'datetime', required: true },
                createdAt: { dataType: 'datetime', required: true },
                schedulerEmailTargetUuid: {
                    dataType: 'string',
                    required: true,
                },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    SchedulerAndTargets: {
        dataType: 'refAlias',
        type: {
            dataType: 'intersection',
            subSchemas: [
                { ref: 'Scheduler' },
                {
                    dataType: 'nestedObjectLiteral',
                    nestedProperties: {
                        targets: {
                            dataType: 'array',
                            array: {
                                dataType: 'union',
                                subSchemas: [
                                    { ref: 'SchedulerSlackTarget' },
                                    { ref: 'SchedulerEmailTarget' },
                                ],
                            },
                            required: true,
                        },
                    },
                },
            ],
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    ApiSchedulerAndTargetsResponse: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                results: { ref: 'SchedulerAndTargets', required: true },
                status: { dataType: 'enum', enums: ['ok'], required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    ScheduledJobs: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                channel: { dataType: 'string' },
                id: { dataType: 'string', required: true },
                date: { dataType: 'datetime', required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    ApiScheduledJobsResponse: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                results: {
                    dataType: 'array',
                    array: { dataType: 'refAlias', ref: 'ScheduledJobs' },
                    required: true,
                },
                status: { dataType: 'enum', enums: ['ok'], required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    ShareUrl: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                host: { dataType: 'string' },
                url: { dataType: 'string' },
                shareUrl: { dataType: 'string' },
                organizationUuid: { dataType: 'string' },
                createdByUserUuid: { dataType: 'string' },
                params: { dataType: 'string', required: true },
                path: { dataType: 'string', required: true },
                nanoid: { dataType: 'string', required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    ApiShareResponse: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                results: { ref: 'ShareUrl', required: true },
                status: { dataType: 'enum', enums: ['ok'], required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    'Pick_ShareUrl.path-or-params_': {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                path: { dataType: 'string', required: true },
                params: { dataType: 'string', required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    CreateShareUrl: {
        dataType: 'refAlias',
        type: { ref: 'Pick_ShareUrl.path-or-params_', validators: {} },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    SlackChannel: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                name: { dataType: 'string', required: true },
                id: { dataType: 'string', required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    ApiSlackChannelsResponse: {
        dataType: 'refAlias',
        type: {
            dataType: 'nestedObjectLiteral',
            nestedProperties: {
                results: {
                    dataType: 'array',
                    array: { dataType: 'refAlias', ref: 'SlackChannel' },
                    required: true,
                },
                status: { dataType: 'enum', enums: ['ok'], required: true },
            },
            validators: {},
        },
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
};
const validationService = new ValidationService(models);

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

export function RegisterRoutes(app: express.Router) {
    // ###########################################################################################################
    //  NOTE: If you do not see routes for all of your controllers in this file, then you might not have informed tsoa of where to look
    //      Please look into the "controllerPathGlobs" config option described in the readme: https://github.com/lukeautry/tsoa
    // ###########################################################################################################
    app.get(
        '/api/v1/projects/:projectUuid/integrations/dbt-cloud/settings',
        ...fetchMiddlewares<RequestHandler>(DbtCloudIntegrationController),
        ...fetchMiddlewares<RequestHandler>(
            DbtCloudIntegrationController.prototype.getSettings,
        ),

        function DbtCloudIntegrationController_getSettings(
            request: any,
            response: any,
            next: any,
        ) {
            const args = {
                projectUuid: {
                    in: 'path',
                    name: 'projectUuid',
                    required: true,
                    dataType: 'string',
                },
                req: {
                    in: 'request',
                    name: 'req',
                    required: true,
                    dataType: 'object',
                },
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);

                const controller = new DbtCloudIntegrationController();

                const promise = controller.getSettings.apply(
                    controller,
                    validatedArgs as any,
                );
                promiseHandler(controller, promise, response, undefined, next);
            } catch (err) {
                return next(err);
            }
        },
    );
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    app.post(
        '/api/v1/projects/:projectUuid/integrations/dbt-cloud/settings',
        ...fetchMiddlewares<RequestHandler>(DbtCloudIntegrationController),
        ...fetchMiddlewares<RequestHandler>(
            DbtCloudIntegrationController.prototype.updateSettings,
        ),

        function DbtCloudIntegrationController_updateSettings(
            request: any,
            response: any,
            next: any,
        ) {
            const args = {
                projectUuid: {
                    in: 'path',
                    name: 'projectUuid',
                    required: true,
                    dataType: 'string',
                },
                req: {
                    in: 'request',
                    name: 'req',
                    required: true,
                    dataType: 'object',
                },
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);

                const controller = new DbtCloudIntegrationController();

                const promise = controller.updateSettings.apply(
                    controller,
                    validatedArgs as any,
                );
                promiseHandler(controller, promise, response, undefined, next);
            } catch (err) {
                return next(err);
            }
        },
    );
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    app.delete(
        '/api/v1/projects/:projectUuid/integrations/dbt-cloud/settings',
        ...fetchMiddlewares<RequestHandler>(DbtCloudIntegrationController),
        ...fetchMiddlewares<RequestHandler>(
            DbtCloudIntegrationController.prototype.deleteSettings,
        ),

        function DbtCloudIntegrationController_deleteSettings(
            request: any,
            response: any,
            next: any,
        ) {
            const args = {
                projectUuid: {
                    in: 'path',
                    name: 'projectUuid',
                    required: true,
                    dataType: 'string',
                },
                req: {
                    in: 'request',
                    name: 'req',
                    required: true,
                    dataType: 'object',
                },
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);

                const controller = new DbtCloudIntegrationController();

                const promise = controller.deleteSettings.apply(
                    controller,
                    validatedArgs as any,
                );
                promiseHandler(controller, promise, response, undefined, next);
            } catch (err) {
                return next(err);
            }
        },
    );
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    app.get(
        '/api/v1/projects/:projectUuid/integrations/dbt-cloud/metrics',
        ...fetchMiddlewares<RequestHandler>(DbtCloudIntegrationController),
        ...fetchMiddlewares<RequestHandler>(
            DbtCloudIntegrationController.prototype.getMetrics,
        ),

        function DbtCloudIntegrationController_getMetrics(
            request: any,
            response: any,
            next: any,
        ) {
            const args = {
                projectUuid: {
                    in: 'path',
                    name: 'projectUuid',
                    required: true,
                    dataType: 'string',
                },
                req: {
                    in: 'request',
                    name: 'req',
                    required: true,
                    dataType: 'object',
                },
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);

                const controller = new DbtCloudIntegrationController();

                const promise = controller.getMetrics.apply(
                    controller,
                    validatedArgs as any,
                );
                promiseHandler(controller, promise, response, undefined, next);
            } catch (err) {
                return next(err);
            }
        },
    );
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    app.get(
        '/api/v1/org',
        ...fetchMiddlewares<RequestHandler>(OrganizationController),
        ...fetchMiddlewares<RequestHandler>(
            OrganizationController.prototype.getOrganization,
        ),

        function OrganizationController_getOrganization(
            request: any,
            response: any,
            next: any,
        ) {
            const args = {
                req: {
                    in: 'request',
                    name: 'req',
                    required: true,
                    dataType: 'object',
                },
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);

                const controller = new OrganizationController();

                const promise = controller.getOrganization.apply(
                    controller,
                    validatedArgs as any,
                );
                promiseHandler(controller, promise, response, undefined, next);
            } catch (err) {
                return next(err);
            }
        },
    );
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    app.patch(
        '/api/v1/org',
        ...fetchMiddlewares<RequestHandler>(OrganizationController),
        ...fetchMiddlewares<RequestHandler>(
            OrganizationController.prototype.updateOrganization,
        ),

        function OrganizationController_updateOrganization(
            request: any,
            response: any,
            next: any,
        ) {
            const args = {
                req: {
                    in: 'request',
                    name: 'req',
                    required: true,
                    dataType: 'object',
                },
                body: {
                    in: 'body',
                    name: 'body',
                    required: true,
                    ref: 'UpdateOrganization',
                },
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);

                const controller = new OrganizationController();

                const promise = controller.updateOrganization.apply(
                    controller,
                    validatedArgs as any,
                );
                promiseHandler(controller, promise, response, undefined, next);
            } catch (err) {
                return next(err);
            }
        },
    );
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    app.delete(
        '/api/v1/org/:organizationUuid',
        ...fetchMiddlewares<RequestHandler>(OrganizationController),
        ...fetchMiddlewares<RequestHandler>(
            OrganizationController.prototype.deleteOrganization,
        ),

        function OrganizationController_deleteOrganization(
            request: any,
            response: any,
            next: any,
        ) {
            const args = {
                req: {
                    in: 'request',
                    name: 'req',
                    required: true,
                    dataType: 'object',
                },
                organizationUuid: {
                    in: 'path',
                    name: 'organizationUuid',
                    required: true,
                    dataType: 'string',
                },
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);

                const controller = new OrganizationController();

                const promise = controller.deleteOrganization.apply(
                    controller,
                    validatedArgs as any,
                );
                promiseHandler(controller, promise, response, undefined, next);
            } catch (err) {
                return next(err);
            }
        },
    );
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    app.get(
        '/api/v1/org/projects',
        ...fetchMiddlewares<RequestHandler>(OrganizationController),
        ...fetchMiddlewares<RequestHandler>(
            OrganizationController.prototype.getOrganizationProjects,
        ),

        function OrganizationController_getOrganizationProjects(
            request: any,
            response: any,
            next: any,
        ) {
            const args = {
                req: {
                    in: 'request',
                    name: 'req',
                    required: true,
                    dataType: 'object',
                },
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);

                const controller = new OrganizationController();

                const promise = controller.getOrganizationProjects.apply(
                    controller,
                    validatedArgs as any,
                );
                promiseHandler(controller, promise, response, undefined, next);
            } catch (err) {
                return next(err);
            }
        },
    );
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    app.post(
        '/api/v1/org/projects/precompiled',
        ...fetchMiddlewares<RequestHandler>(OrganizationController),
        ...fetchMiddlewares<RequestHandler>(
            OrganizationController.prototype.createPrecompiledProject,
        ),

        function OrganizationController_createPrecompiledProject(
            request: any,
            response: any,
            next: any,
        ) {
            const args = {
                req: {
                    in: 'request',
                    name: 'req',
                    required: true,
                    dataType: 'object',
                },
                body: {
                    in: 'body',
                    name: 'body',
                    required: true,
                    ref: 'CreateProject',
                },
                method: {
                    in: 'header',
                    name: 'Lightdash-Request-Method',
                    required: true,
                    ref: 'RequestMethod',
                },
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);

                const controller = new OrganizationController();

                const promise = controller.createPrecompiledProject.apply(
                    controller,
                    validatedArgs as any,
                );
                promiseHandler(controller, promise, response, undefined, next);
            } catch (err) {
                return next(err);
            }
        },
    );
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    app.post(
        '/api/v1/org/projects',
        ...fetchMiddlewares<RequestHandler>(OrganizationController),
        ...fetchMiddlewares<RequestHandler>(
            OrganizationController.prototype.createProject,
        ),

        function OrganizationController_createProject(
            request: any,
            response: any,
            next: any,
        ) {
            const args = {
                req: {
                    in: 'request',
                    name: 'req',
                    required: true,
                    dataType: 'object',
                },
                body: {
                    in: 'body',
                    name: 'body',
                    required: true,
                    ref: 'CreateProject',
                },
                method: {
                    in: 'header',
                    name: 'Lightdash-Request-Method',
                    required: true,
                    ref: 'RequestMethod',
                },
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);

                const controller = new OrganizationController();

                const promise = controller.createProject.apply(
                    controller,
                    validatedArgs as any,
                );
                promiseHandler(controller, promise, response, undefined, next);
            } catch (err) {
                return next(err);
            }
        },
    );
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    app.delete(
        '/api/v1/org/projects/:projectUuid',
        ...fetchMiddlewares<RequestHandler>(OrganizationController),
        ...fetchMiddlewares<RequestHandler>(
            OrganizationController.prototype.deleteProject,
        ),

        function OrganizationController_deleteProject(
            request: any,
            response: any,
            next: any,
        ) {
            const args = {
                req: {
                    in: 'request',
                    name: 'req',
                    required: true,
                    dataType: 'object',
                },
                projectUuid: {
                    in: 'path',
                    name: 'projectUuid',
                    required: true,
                    dataType: 'string',
                },
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);

                const controller = new OrganizationController();

                const promise = controller.deleteProject.apply(
                    controller,
                    validatedArgs as any,
                );
                promiseHandler(controller, promise, response, undefined, next);
            } catch (err) {
                return next(err);
            }
        },
    );
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    app.get(
        '/api/v1/org/users',
        ...fetchMiddlewares<RequestHandler>(OrganizationController),
        ...fetchMiddlewares<RequestHandler>(
            OrganizationController.prototype.getOrganizationMembers,
        ),

        function OrganizationController_getOrganizationMembers(
            request: any,
            response: any,
            next: any,
        ) {
            const args = {
                req: {
                    in: 'request',
                    name: 'req',
                    required: true,
                    dataType: 'object',
                },
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);

                const controller = new OrganizationController();

                const promise = controller.getOrganizationMembers.apply(
                    controller,
                    validatedArgs as any,
                );
                promiseHandler(controller, promise, response, undefined, next);
            } catch (err) {
                return next(err);
            }
        },
    );
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    app.patch(
        '/api/v1/org/users/:userUuid',
        ...fetchMiddlewares<RequestHandler>(OrganizationController),
        ...fetchMiddlewares<RequestHandler>(
            OrganizationController.prototype.updateOrganizationMember,
        ),

        function OrganizationController_updateOrganizationMember(
            request: any,
            response: any,
            next: any,
        ) {
            const args = {
                req: {
                    in: 'request',
                    name: 'req',
                    required: true,
                    dataType: 'object',
                },
                userUuid: {
                    in: 'path',
                    name: 'userUuid',
                    required: true,
                    dataType: 'string',
                },
                body: {
                    in: 'body',
                    name: 'body',
                    required: true,
                    ref: 'OrganizationMemberProfileUpdate',
                },
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);

                const controller = new OrganizationController();

                const promise = controller.updateOrganizationMember.apply(
                    controller,
                    validatedArgs as any,
                );
                promiseHandler(controller, promise, response, undefined, next);
            } catch (err) {
                return next(err);
            }
        },
    );
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    app.delete(
        '/api/v1/org/user/:userUuid',
        ...fetchMiddlewares<RequestHandler>(OrganizationController),
        ...fetchMiddlewares<RequestHandler>(
            OrganizationController.prototype.deleteUser,
        ),

        function OrganizationController_deleteUser(
            request: any,
            response: any,
            next: any,
        ) {
            const args = {
                req: {
                    in: 'request',
                    name: 'req',
                    required: true,
                    dataType: 'object',
                },
                userUuid: {
                    in: 'path',
                    name: 'userUuid',
                    required: true,
                    dataType: 'string',
                },
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);

                const controller = new OrganizationController();

                const promise = controller.deleteUser.apply(
                    controller,
                    validatedArgs as any,
                );
                promiseHandler(controller, promise, response, undefined, next);
            } catch (err) {
                return next(err);
            }
        },
    );
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    app.get(
        '/api/v1/org/onboardingStatus',
        ...fetchMiddlewares<RequestHandler>(OrganizationController),
        ...fetchMiddlewares<RequestHandler>(
            OrganizationController.prototype.getOnboardingStatus,
        ),

        function OrganizationController_getOnboardingStatus(
            request: any,
            response: any,
            next: any,
        ) {
            const args = {
                req: {
                    in: 'request',
                    name: 'req',
                    required: true,
                    dataType: 'object',
                },
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);

                const controller = new OrganizationController();

                const promise = controller.getOnboardingStatus.apply(
                    controller,
                    validatedArgs as any,
                );
                promiseHandler(controller, promise, response, undefined, next);
            } catch (err) {
                return next(err);
            }
        },
    );
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    app.post(
        '/api/v1/org/onboardingStatus/shownSuccess',
        ...fetchMiddlewares<RequestHandler>(OrganizationController),
        ...fetchMiddlewares<RequestHandler>(
            OrganizationController.prototype.updateOnboardingStatusShownSuccess,
        ),

        function OrganizationController_updateOnboardingStatusShownSuccess(
            request: any,
            response: any,
            next: any,
        ) {
            const args = {
                req: {
                    in: 'request',
                    name: 'req',
                    required: true,
                    dataType: 'object',
                },
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);

                const controller = new OrganizationController();

                const promise =
                    controller.updateOnboardingStatusShownSuccess.apply(
                        controller,
                        validatedArgs as any,
                    );
                promiseHandler(controller, promise, response, undefined, next);
            } catch (err) {
                return next(err);
            }
        },
    );
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    app.get(
        '/api/v1/schedulers/:schedulerUuid',
        ...fetchMiddlewares<RequestHandler>(SchedulerController),
        ...fetchMiddlewares<RequestHandler>(SchedulerController.prototype.get),

        function SchedulerController_get(
            request: any,
            response: any,
            next: any,
        ) {
            const args = {
                schedulerUuid: {
                    in: 'path',
                    name: 'schedulerUuid',
                    required: true,
                    dataType: 'string',
                },
                req: {
                    in: 'request',
                    name: 'req',
                    required: true,
                    dataType: 'object',
                },
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);

                const controller = new SchedulerController();

                const promise = controller.get.apply(
                    controller,
                    validatedArgs as any,
                );
                promiseHandler(controller, promise, response, 200, next);
            } catch (err) {
                return next(err);
            }
        },
    );
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    app.patch(
        '/api/v1/schedulers/:schedulerUuid',
        ...fetchMiddlewares<RequestHandler>(SchedulerController),
        ...fetchMiddlewares<RequestHandler>(
            SchedulerController.prototype.patch,
        ),

        function SchedulerController_patch(
            request: any,
            response: any,
            next: any,
        ) {
            const args = {
                schedulerUuid: {
                    in: 'path',
                    name: 'schedulerUuid',
                    required: true,
                    dataType: 'string',
                },
                req: {
                    in: 'request',
                    name: 'req',
                    required: true,
                    dataType: 'object',
                },
                body: {
                    in: 'body',
                    name: 'body',
                    required: true,
                    dataType: 'any',
                },
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);

                const controller = new SchedulerController();

                const promise = controller.patch.apply(
                    controller,
                    validatedArgs as any,
                );
                promiseHandler(controller, promise, response, 201, next);
            } catch (err) {
                return next(err);
            }
        },
    );
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    app.delete(
        '/api/v1/schedulers/:schedulerUuid',
        ...fetchMiddlewares<RequestHandler>(SchedulerController),
        ...fetchMiddlewares<RequestHandler>(
            SchedulerController.prototype.delete,
        ),

        function SchedulerController_delete(
            request: any,
            response: any,
            next: any,
        ) {
            const args = {
                schedulerUuid: {
                    in: 'path',
                    name: 'schedulerUuid',
                    required: true,
                    dataType: 'string',
                },
                req: {
                    in: 'request',
                    name: 'req',
                    required: true,
                    dataType: 'object',
                },
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);

                const controller = new SchedulerController();

                const promise = controller.delete.apply(
                    controller,
                    validatedArgs as any,
                );
                promiseHandler(controller, promise, response, 201, next);
            } catch (err) {
                return next(err);
            }
        },
    );
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    app.get(
        '/api/v1/schedulers/:schedulerUuid/jobs',
        ...fetchMiddlewares<RequestHandler>(SchedulerController),
        ...fetchMiddlewares<RequestHandler>(
            SchedulerController.prototype.getJobs,
        ),

        function SchedulerController_getJobs(
            request: any,
            response: any,
            next: any,
        ) {
            const args = {
                schedulerUuid: {
                    in: 'path',
                    name: 'schedulerUuid',
                    required: true,
                    dataType: 'string',
                },
                req: {
                    in: 'request',
                    name: 'req',
                    required: true,
                    dataType: 'object',
                },
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);

                const controller = new SchedulerController();

                const promise = controller.getJobs.apply(
                    controller,
                    validatedArgs as any,
                );
                promiseHandler(controller, promise, response, 200, next);
            } catch (err) {
                return next(err);
            }
        },
    );
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    app.get(
        '/api/v1/share/:nanoId',
        ...fetchMiddlewares<RequestHandler>(ShareController),
        ...fetchMiddlewares<RequestHandler>(ShareController.prototype.get),

        function ShareController_get(request: any, response: any, next: any) {
            const args = {
                nanoId: {
                    in: 'path',
                    name: 'nanoId',
                    required: true,
                    dataType: 'string',
                },
                req: {
                    in: 'request',
                    name: 'req',
                    required: true,
                    dataType: 'object',
                },
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);

                const controller = new ShareController();

                const promise = controller.get.apply(
                    controller,
                    validatedArgs as any,
                );
                promiseHandler(controller, promise, response, undefined, next);
            } catch (err) {
                return next(err);
            }
        },
    );
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    app.post(
        '/api/v1/share',
        ...fetchMiddlewares<RequestHandler>(ShareController),
        ...fetchMiddlewares<RequestHandler>(ShareController.prototype.create),

        function ShareController_create(
            request: any,
            response: any,
            next: any,
        ) {
            const args = {
                body: {
                    in: 'body',
                    name: 'body',
                    required: true,
                    ref: 'CreateShareUrl',
                },
                req: {
                    in: 'request',
                    name: 'req',
                    required: true,
                    dataType: 'object',
                },
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);

                const controller = new ShareController();

                const promise = controller.create.apply(
                    controller,
                    validatedArgs as any,
                );
                promiseHandler(controller, promise, response, 201, next);
            } catch (err) {
                return next(err);
            }
        },
    );
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    app.get(
        '/api/v1/slack/channels',
        ...fetchMiddlewares<RequestHandler>(SlackController),
        ...fetchMiddlewares<RequestHandler>(SlackController.prototype.get),

        function SlackController_get(request: any, response: any, next: any) {
            const args = {
                req: {
                    in: 'request',
                    name: 'req',
                    required: true,
                    dataType: 'object',
                },
            };

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = getValidatedArgs(args, request, response);

                const controller = new SlackController();

                const promise = controller.get.apply(
                    controller,
                    validatedArgs as any,
                );
                promiseHandler(controller, promise, response, 200, next);
            } catch (err) {
                return next(err);
            }
        },
    );
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

    function isController(object: any): object is Controller {
        return (
            'getHeaders' in object &&
            'getStatus' in object &&
            'setStatus' in object
        );
    }

    function promiseHandler(
        controllerObj: any,
        promise: any,
        response: any,
        successStatus: any,
        next: any,
    ) {
        return Promise.resolve(promise)
            .then((data: any) => {
                let statusCode = successStatus;
                let headers;
                if (isController(controllerObj)) {
                    headers = controllerObj.getHeaders();
                    statusCode = controllerObj.getStatus() || statusCode;
                }

                // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

                returnHandler(response, statusCode, data, headers);
            })
            .catch((error: any) => next(error));
    }

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

    function returnHandler(
        response: any,
        statusCode?: number,
        data?: any,
        headers: any = {},
    ) {
        if (response.headersSent) {
            return;
        }
        Object.keys(headers).forEach((name: string) => {
            response.set(name, headers[name]);
        });
        if (
            data &&
            typeof data.pipe === 'function' &&
            data.readable &&
            typeof data._read === 'function'
        ) {
            data.pipe(response);
        } else if (data !== null && data !== undefined) {
            response.status(statusCode || 200).json(data);
        } else {
            response.status(statusCode || 204).end();
        }
    }

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

    function responder(
        response: any,
    ): TsoaResponse<HttpStatusCodeLiteral, unknown> {
        return function (status, data, headers) {
            returnHandler(response, status, data, headers);
        };
    }

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

    function getValidatedArgs(args: any, request: any, response: any): any[] {
        const fieldErrors: FieldErrors = {};
        const values = Object.keys(args).map((key) => {
            const name = args[key].name;
            switch (args[key].in) {
                case 'request':
                    return request;
                case 'query':
                    return validationService.ValidateParam(
                        args[key],
                        request.query[name],
                        name,
                        fieldErrors,
                        undefined,
                        { noImplicitAdditionalProperties: 'throw-on-extras' },
                    );
                case 'path':
                    return validationService.ValidateParam(
                        args[key],
                        request.params[name],
                        name,
                        fieldErrors,
                        undefined,
                        { noImplicitAdditionalProperties: 'throw-on-extras' },
                    );
                case 'header':
                    return validationService.ValidateParam(
                        args[key],
                        request.header(name),
                        name,
                        fieldErrors,
                        undefined,
                        { noImplicitAdditionalProperties: 'throw-on-extras' },
                    );
                case 'body':
                    return validationService.ValidateParam(
                        args[key],
                        request.body,
                        name,
                        fieldErrors,
                        undefined,
                        { noImplicitAdditionalProperties: 'throw-on-extras' },
                    );
                case 'body-prop':
                    return validationService.ValidateParam(
                        args[key],
                        request.body[name],
                        name,
                        fieldErrors,
                        'body.',
                        { noImplicitAdditionalProperties: 'throw-on-extras' },
                    );
                case 'formData':
                    if (args[key].dataType === 'file') {
                        return validationService.ValidateParam(
                            args[key],
                            request.file,
                            name,
                            fieldErrors,
                            undefined,
                            {
                                noImplicitAdditionalProperties:
                                    'throw-on-extras',
                            },
                        );
                    } else if (
                        args[key].dataType === 'array' &&
                        args[key].array.dataType === 'file'
                    ) {
                        return validationService.ValidateParam(
                            args[key],
                            request.files,
                            name,
                            fieldErrors,
                            undefined,
                            {
                                noImplicitAdditionalProperties:
                                    'throw-on-extras',
                            },
                        );
                    } else {
                        return validationService.ValidateParam(
                            args[key],
                            request.body[name],
                            name,
                            fieldErrors,
                            undefined,
                            {
                                noImplicitAdditionalProperties:
                                    'throw-on-extras',
                            },
                        );
                    }
                case 'res':
                    return responder(response);
            }
        });

        if (Object.keys(fieldErrors).length > 0) {
            throw new ValidateError(fieldErrors, '');
        }
        return values;
    }

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
}

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
