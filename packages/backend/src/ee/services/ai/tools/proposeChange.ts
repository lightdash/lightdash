import {
    assertUnreachable,
    ChangeBase,
    convertAdditionalMetric,
    Explore,
    getItemId,
    ToolProposeChangeArgs,
    toolProposeChangeArgsSchema,
    toolProposeChangeOutputSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import type { GetExploreCompilerFn } from '../types/aiAgentDependencies';
import { CreateChangeFn } from '../types/aiAgentDependencies';
import { AgentContext } from '../utils/AgentContext';
import { populateCustomMetricSQL } from '../utils/populateCustomMetricsSQL';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { validateChangesetApplyChange } from '../utils/validateChangesetApply';
import {
    validateFieldEntityType,
    validateTableNames,
} from '../utils/validators';

export const translateToolProposeChangeArgs = async (
    toolArgs: ToolProposeChangeArgs,
    explore: Explore,
    getExploreCompiler: GetExploreCompilerFn,
): Promise<ChangeBase> => {
    const { entityTableName, change } = toolArgs;
    const { entityType, value } = change;

    // Determine entityName based on entityType
    const entityName =
        entityType === 'table'
            ? entityTableName
            : change.fieldId.replace(new RegExp(`^${entityTableName}_`), '');

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

            return {
                type: value.type,
                entityType,
                entityTableName,
                entityName,
                payload: { patches },
            };
        case 'create':
            const exploreCompiler = await getExploreCompiler();

            const additionalMetric = populateCustomMetricSQL(
                value.value.metric,
                explore,
            );

            if (!additionalMetric) {
                throw new Error(
                    'Base dimension field not found. Try using the right table name and dimension name',
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

            return {
                type: value.type,
                entityType,
                entityTableName,
                entityName,
                payload: {
                    type: value.value.entityType,
                    value: compiledMetric,
                },
            };

        default:
            return assertUnreachable(value, 'Invalid change type');
    }
};

type GetProposeChangeArgs = {
    createChange: CreateChangeFn;
    getExploreCompiler: GetExploreCompilerFn;
};

export const getProposeChange = ({
    createChange,
    getExploreCompiler,
}: GetProposeChangeArgs) =>
    tool({
        description: toolProposeChangeArgsSchema.description,
        inputSchema: toolProposeChangeArgsSchema,
        outputSchema: toolProposeChangeOutputSchema,
        execute: async (toolArgs, { experimental_context: context }) => {
            try {
                const ctx = AgentContext.from(context);
                const { entityTableName, change } = toolArgs;
                const explore = ctx.getExplore(entityTableName);

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
                                validateFieldEntityType(
                                    explore,
                                    [
                                        getItemId({
                                            table: entityTableName,
                                            name: change.value.value.metric
                                                .baseDimensionName,
                                        }),
                                    ],
                                    'dimension',
                                );
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

                validateChangesetApplyChange(translatedArgs, {
                    [entityTableName]: explore,
                });

                const changeUuid = await createChange(translatedArgs);

                return {
                    result: `Successfully proposed change to ${translatedArgs.entityType} "${translatedArgs.entityName}" in table "${translatedArgs.entityTableName}"`,
                    metadata: {
                        status: 'success',
                        changeUuid,
                        userFeedback: 'accepted',
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(error, 'Error proposing change'),
                    metadata: {
                        status: 'error',
                    },
                };
            }
        },
        toModelOutput: (output) => toModelOutput(output),
    });
