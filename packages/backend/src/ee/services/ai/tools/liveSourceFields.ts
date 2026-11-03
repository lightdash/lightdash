import {
    getItemId,
    listLiveSourceFieldsToolDefinition,
    LIVE_SOURCE_FIELDS_TOOL_ROW_LIMIT,
    type LiveSourceField,
    type ToolListLiveSourceFieldsArgs,
    type ToolListLiveSourceFieldsStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { ListLiveSourceFieldsFn } from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';

const matchesStatus = (
    field: LiveSourceField,
    status: ToolListLiveSourceFieldsArgs['status'],
) => {
    switch (status) {
        case 'inUse':
            return field.inUse;
        case 'available':
            return !field.inUse;
        case 'all':
        default:
            return true;
    }
};

const matchesSearch = (field: LiveSourceField, search: string | null) => {
    const words = (search ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    const text = [field.name, field.label, field.apiName, field.description]
        .join(' ')
        .toLowerCase();
    return words.every((word) => text.includes(word));
};

export const getListLiveSourceFields = ({
    listLiveSourceFields,
}: {
    listLiveSourceFields: ListLiveSourceFieldsFn;
}) =>
    tool({
        ...listLiveSourceFieldsToolDefinition.for('agent'),
        execute: async ({
            connectionUuid,
            status,
            search,
        }): Promise<
            | ExecuteStructuredToolResult<ToolListLiveSourceFieldsStructuredContent>
            | ExecuteToolErrorResult
        > => {
            try {
                const { exploreName, fields } =
                    await listLiveSourceFields(connectionUuid);
                const matches = fields.filter(
                    (field) =>
                        matchesStatus(field, status) &&
                        matchesSearch(field, search),
                );
                const structuredContent: ToolListLiveSourceFieldsStructuredContent =
                    {
                        exploreName,
                        matchCount: matches.length,
                        fields: matches
                            .slice(0, LIVE_SOURCE_FIELDS_TOOL_ROW_LIMIT)
                            .map((field) => ({
                                name: field.name,
                                fieldId: getItemId({
                                    table: exploreName,
                                    name: field.name,
                                }),
                                label: field.label,
                                kind: field.kind,
                                type: field.type,
                                source: field.apiName,
                                description: field.description,
                                aiHint: field.aiHint,
                                group: field.group,
                                inUse: field.inUse,
                                isRequired: field.isRequired,
                                isInternal: field.isInternal,
                                usedByChartCount: field.usedByChartCount,
                            })),
                    };
                const hidden = matches.length - structuredContent.fields.length;
                return {
                    result: JSON.stringify({
                        ...structuredContent,
                        ...(hidden > 0
                            ? {
                                  note: `${hidden} more fields match; narrow the search to see them.`,
                              }
                            : {}),
                    }),
                    metadata: { status: 'success' },
                    structuredContent,
                };
            } catch (error) {
                return toolErrorOutput(
                    error,
                    'Error listing live data source fields.',
                );
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
