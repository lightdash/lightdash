import snakeCase from 'lodash/snakeCase';
import { ToolNameSchema } from '../visualizations';

const SharedAiToolNameResources = ToolNameSchema.enum;

export const McpToolNameResources = {
    getLightdashVersion: snakeCase('getLightdashVersion'),
    listExplores: snakeCase('listExplores'),
    findExplores: snakeCase(SharedAiToolNameResources.findExplores),
    findFields: snakeCase(SharedAiToolNameResources.findFields),
    findContent: snakeCase(SharedAiToolNameResources.findContent),
    listProjects: snakeCase('listProjects'),
    setProject: snakeCase('setProject'),
    getCurrentProject: snakeCase('getCurrentProject'),
    listAgents: snakeCase('listAgents'),
    setAgent: snakeCase('setAgent'),
    clearAgent: snakeCase('clearAgent'),
    getCurrentAgent: snakeCase('getCurrentAgent'),
    runMetricQuery: snakeCase('runMetricQuery'),
    runSql: snakeCase(SharedAiToolNameResources.runSql),
    searchFieldValues: snakeCase(SharedAiToolNameResources.searchFieldValues),
    listVerifiedContent: snakeCase('listVerifiedContent'),
} as const;

export type McpToolName =
    (typeof McpToolNameResources)[keyof typeof McpToolNameResources];
