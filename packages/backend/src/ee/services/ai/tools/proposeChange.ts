import {
    CreateChangeParams,
    NotImplementedError,
    ToolProposeChangeArgs,
    toolProposeChangeArgsSchema,
    toolProposeChangeOutputSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import type { GetExploreFn } from '../types/aiAgentDependencies';
import { CreateChangeFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import {
    validateFieldEntityType,
    validateTableNames,
} from '../utils/validators';

export const translateToolProposeChangeArgs = (
    toolArgs: ToolProposeChangeArgs,
) => {
    const { entityTableName, change } = toolArgs;
    const { entityType, value } = change;
    const { type, patch } = value;

    // Convert patch object to JSON patch format
    const patches = Object.entries(patch)
        .filter(([, patchValue]) => patchValue !== null)
        .map(([key, patchValue]) => {
            if (!patchValue) throw new Error('Patch value is null');
            return {
                op: patchValue.op,
                path: `/${key}`,
                value: patchValue.value,
            };
        });

    // Determine entityName based on entityType
    const entityName =
        entityType === 'table'
            ? entityTableName
            : change.fieldId.replace(new RegExp(`^${entityTableName}_`), '');

    return {
        type,
        entityType,
        entityTableName,
        entityName,
        payload: {
            patches,
        },
    };
};

type GetProposeChangeArgs = {
    createChange: CreateChangeFn;
    getExplore: GetExploreFn;
};

export const getProposeChange = ({
    createChange,
    getExplore,
}: GetProposeChangeArgs) =>
    tool({
        description: toolProposeChangeArgsSchema.description,
        inputSchema: toolProposeChangeArgsSchema,
        outputSchema: toolProposeChangeOutputSchema,
        execute: async (toolArgs) => {
            try {
                const { entityTableName, change } = toolArgs;
                const explore = await getExplore({
                    exploreName: entityTableName,
                });

                validateTableNames(explore, [entityTableName]);
                if (change.entityType !== 'table') {
                    validateFieldEntityType(
                        explore,
                        [change.fieldId],
                        change.entityType,
                    );
                }

                const translatedArgs = translateToolProposeChangeArgs(toolArgs);
                await createChange(translatedArgs);
                return {
                    result: `Successfully proposed change to ${translatedArgs.entityType} "${translatedArgs.entityName}" in table "${translatedArgs.entityTableName}"`,
                    metadata: {
                        status: 'success',
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
