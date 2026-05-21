import snakeCase from 'lodash/snakeCase';
import { ToolNameSchema } from '../visualizations';

const SharedAiToolNameResources = ToolNameSchema.enum;

export const McpToolResources = {
    getLightdashVersion: {
        name: snakeCase('getLightdashVersion'),
        title: 'Get Lightdash Version',
    },
    listExplores: {
        name: snakeCase('listExplores'),
        title: 'List Explores',
    },
    findExplores: {
        name: snakeCase(SharedAiToolNameResources.findExplores),
        title: 'Find Explores',
    },
    findFields: {
        name: snakeCase(SharedAiToolNameResources.findFields),
        title: 'Find Fields',
    },
    findContent: {
        name: snakeCase(SharedAiToolNameResources.findContent),
        title: 'Find Content',
    },
    listProjects: {
        name: snakeCase('listProjects'),
        title: 'List Projects',
    },
    setProject: {
        name: snakeCase('setProject'),
        title: 'Set Project',
    },
    getCurrentProject: {
        name: snakeCase('getCurrentProject'),
        title: 'Get Current Project',
    },
    listAgents: {
        name: snakeCase('listAgents'),
        title: 'List Agents',
    },
    setAgent: {
        name: snakeCase('setAgent'),
        title: 'Set Agent',
    },
    clearAgent: {
        name: snakeCase('clearAgent'),
        title: 'Clear Agent',
    },
    getCurrentAgent: {
        name: snakeCase('getCurrentAgent'),
        title: 'Get Current Agent',
    },
    runMetricQuery: {
        name: snakeCase('runMetricQuery'),
        title: 'Run Metric Query',
    },
    runSql: {
        name: snakeCase(SharedAiToolNameResources.runSql),
        title: 'Run SQL',
    },
    searchFieldValues: {
        name: snakeCase(SharedAiToolNameResources.searchFieldValues),
        title: 'Search Field Values',
    },
    listVerifiedContent: {
        name: snakeCase('listVerifiedContent'),
        title: 'List Verified Content',
    },
} as const;

export type McpToolName =
    (typeof McpToolResources)[keyof typeof McpToolResources]['name'];
