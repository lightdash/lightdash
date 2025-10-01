import {
    CreateChangeParams,
    NotImplementedError,
    ToolProposeChangeArgs,
    toolProposeChangeArgsSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import { CreateChangeFn } from '../types/aiAgentDependencies';

import { toolErrorHandler } from '../utils/toolErrorHandler';

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
};

export const getProposeChange = ({ createChange }: GetProposeChangeArgs) =>
    tool({
        description: toolProposeChangeArgsSchema.description,
        inputSchema: toolProposeChangeArgsSchema,
        execute: async (toolArgs) => {
            try {
                const translatedArgs = translateToolProposeChangeArgs(toolArgs);
                await createChange(translatedArgs);
                return `Successfully proposed change to ${translatedArgs.entityType} "${translatedArgs.entityName}" in table "${translatedArgs.entityTableName}"`;
            } catch (error) {
                return toolErrorHandler(error, 'Error proposing change');
            }
        },
    });
