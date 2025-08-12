import {
    getItemLabelWithoutTableName,
    getTotalFilterRules,
    metricQueryTableViz,
    toolRunMetricQueryArgsSchema,
    toolRunMetricQueryArgsSchemaTransformed,
} from '@lightdash/common';
import { tool } from 'ai';
import { stringify } from 'csv-stringify/sync';
import { CsvService } from '../../../../services/CsvService/CsvService';
import type {
    GetExploreFn,
    RunMiniMetricQueryFn,
} from '../types/aiAgentDependencies';
import { serializeData } from '../utils/serializeData';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import {
    validateFilterRules,
    validateSelectedFieldsExistence,
} from '../utils/validators';

type Dependencies = {
    getExplore: GetExploreFn;
    runMiniMetricQuery: RunMiniMetricQueryFn;
    maxLimit: number;
};

export const getRunMetricQuery = ({
    getExplore,
    runMiniMetricQuery,
    maxLimit,
}: Dependencies) =>
    tool({
        description: toolRunMetricQueryArgsSchema.description,
        parameters: toolRunMetricQueryArgsSchema,
        execute: async (toolArgs) => {
            try {
                const vizTool =
                    toolRunMetricQueryArgsSchemaTransformed.parse(toolArgs);

                const filterRules = getTotalFilterRules(vizTool.filters ?? []);
                const explore = await getExplore({
                    exploreName: vizTool.vizConfig.exploreName,
                });

                const fieldsToValidate = [
                    ...vizTool.vizConfig.dimensions,
                    ...vizTool.vizConfig.metrics,
                    ...vizTool.vizConfig.sorts.map(
                        (sortField) => sortField.fieldId,
                    ),
                ].filter((x) => typeof x === 'string');

                validateSelectedFieldsExistence(explore, fieldsToValidate);
                validateFilterRules(explore, filterRules);

                const query = metricQueryTableViz(
                    vizTool.vizConfig,
                    vizTool.filters,
                    maxLimit,
                );

                const results = await runMiniMetricQuery(query, maxLimit);

                const fieldIds = results.rows[0]
                    ? Object.keys(results.rows[0])
                    : [];

                const csvHeaders = fieldIds.map((fieldId) => {
                    const item = results.fields[fieldId];
                    if (!item) {
                        return fieldId;
                    }
                    return getItemLabelWithoutTableName(item);
                });

                const rows = results.rows.map((row) =>
                    CsvService.convertRowToCsv(
                        row,
                        results.fields,
                        true,
                        fieldIds,
                    ),
                );

                const csv = stringify(rows, {
                    header: true,
                    columns: csvHeaders,
                });

                return serializeData(csv, 'csv');
            } catch (e) {
                return toolErrorHandler(e, 'Error running metric query.');
            }
        },
    });
