import {
    assertUnreachable,
    convertAdditionalMetric,
    Explore,
    ToolProposeChangeArgs,
    toolProposeChangeArgsSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import type {
    GetExploreCompilerFn,
    GetExploreFn,
} from '../types/aiAgentDependencies';
import { CreateChangeFn } from '../types/aiAgentDependencies';
import { populateCustomMetricSQL } from '../utils/populateCustomMetricsSQL';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import {
    validateFieldEntityType,
    validateTableNames,
} from '../utils/validators';

export const translateToolProposeChangeArgs = async (
    toolArgs: ToolProposeChangeArgs,
    explore: Explore,
    getExploreCompiler: GetExploreCompilerFn,
) => {
    const { entityTableName, change } = toolArgs;
    const { entityType, value } = change;

    let payload: object = {};

    switch (value.type) {
        case 'update':
            // Convert patch object to JSON patch format
            const patches = Object.entries(value.patch)
                .filter(([, patchValue]) => patchValue !== null)
                .map(([key, patchValue]) => {
                    if (!patchValue) throw new Error('Patch value is null');
                    return {
                        op: patchValue.op,
                        path: `/${key}`,
                        value: patchValue.value,
                    };
                });

            payload = {
                patches,
            };
            break;
        case 'create':
            const exploreCompiler = await getExploreCompiler();

            const additionalMetric = populateCustomMetricSQL(
                value.value.metric,
                explore,
            );

            if (!additionalMetric) {
                throw new Error(
                    'Dimension field not found. Try using the right table name and dimension name',
                );
            }

            const metric = convertAdditionalMetric({
                additionalMetric,
                table: explore.tables[value.value.metric.table],
            });

            const compiledMetric = exploreCompiler.compileMetric(
                metric,
                explore.tables,
                [],
            );

            payload = {
                type: value.value.entityType,
                value: compiledMetric,
            };
            break;

        default:
            return assertUnreachable(value, 'Invalid change type');
    }

    // Determine entityName based on entityType
    const entityName =
        entityType === 'table'
            ? entityTableName
            : change.fieldId.replace(new RegExp(`^${entityTableName}_`), '');

    return {
        type: value.type,
        entityType,
        entityTableName,
        entityName,
        payload,
    };
};

type GetProposeChangeArgs = {
    createChange: CreateChangeFn;
    getExplore: GetExploreFn;
    getExploreCompiler: GetExploreCompilerFn;
};

export const getProposeChange = ({
    createChange,
    getExplore,
    getExploreCompiler,
}: GetProposeChangeArgs) =>
    tool({
        description: toolProposeChangeArgsSchema.description,
        inputSchema: toolProposeChangeArgsSchema,
        execute: async (toolArgs) => {
            try {
                const { entityTableName, change } = toolArgs;
                const explore = await getExplore({
                    exploreName: entityTableName,
                });

                switch (change.entityType) {
                    case 'table':
                        switch (change.value.type) {
                            case 'update':
                                validateTableNames(explore, [entityTableName]);
                                break;
                            default:
                                return assertUnreachable(
                                    change.value.type,
                                    'Invalid change type',
                                );
                        }
                        break;
                    case 'dimension':
                    case 'metric':
                        switch (change.value.type) {
                            case 'create':
                                validateTableNames(explore, [entityTableName]);
                                break;
                            case 'update':
                                validateTableNames(explore, [entityTableName]);
                                validateFieldEntityType(
                                    explore,
                                    [change.fieldId],
                                    change.entityType,
                                );
                                break;
                            default:
                                return assertUnreachable(
                                    change.value,
                                    'Invalid change type',
                                );
                        }
                        break;
                    default:
                        return assertUnreachable(change, 'Invalid entity type');
                }

                const translatedArgs = await translateToolProposeChangeArgs(
                    toolArgs,
                    explore,
                    getExploreCompiler,
                );
                await createChange(translatedArgs);
                return `Successfully proposed change to ${translatedArgs.entityType} "${translatedArgs.entityName}" in table "${translatedArgs.entityTableName}"`;
            } catch (error) {
                return toolErrorHandler(error, 'Error proposing change');
            }
        },
    });
