import { AnyType } from '@lightdash/common';

const oneLine = (value: string, maxLength = 180) => {
    const text = value.replace(/\s+/g, ' ').trim();
    return text.length > maxLength
        ? `${text.slice(0, maxLength - 3)}...`
        : text;
};

const readString = (input: AnyType, keys: string[]) => {
    if (!input || typeof input !== 'object') return undefined;
    for (const key of keys) {
        const value = input[key];
        if (typeof value === 'string' && value.trim()) return value;
        if (Array.isArray(value) && value.length > 0) {
            return value
                .filter((item): item is string => typeof item === 'string')
                .slice(0, 3)
                .join(', ');
        }
    }
    return undefined;
};

export const summarizeToolCall = (toolName: string, input: AnyType) => {
    const quoted = (text?: string) => (text ? `“${oneLine(text)}”` : undefined);
    switch (toolName) {
        case 'runSql':
            return 'Checking query';
        case 'repoShell':
            return quoted(readString(input, ['command'])) ?? 'Inspecting files';
        case 'searchSemanticLayer':
            return (
                quoted(readString(input, ['searchQuery', 'query'])) ??
                'Searching semantic layer'
            );
        case 'findExplores':
            return (
                quoted(readString(input, ['searchQuery'])) ?? 'Finding explores'
            );
        case 'findFields':
            return (
                quoted(
                    readString(input, [
                        'fieldSearchQueries',
                        'fieldSearchQuery',
                    ]),
                ) ?? 'Checking fields'
            );
        case 'listFields':
            return 'Reading field details';
        case 'findContent':
            return (
                quoted(readString(input, ['query', 'searchQuery'])) ??
                'Searching content'
            );
        case 'readContent':
            return (
                quoted(readString(input, ['contentUuid', 'slug'])) ??
                'Reading content'
            );
        case 'describeWarehouseTable':
            return (
                quoted(readString(input, ['table', 'tableName'])) ??
                'Inspecting table'
            );
        case 'loadProjectContext':
            return 'Reading project context';
        case 'discoverFields':
            return 'Finding the fields to answer this';
        case 'generateVisualization':
            return 'Building chart';
        case 'generateDashboard':
            return 'Building dashboard structure';
        case 'getProjectInfo':
            return 'Reading project details';
        case 'editDbtProject':
        case 'proposeChange':
            return 'Preparing change proposal';
        default:
            return quoted(
                readString(input, ['query', 'searchQuery', 'name', 'path']),
            );
    }
};

export const summarizeToolResult = (toolName: string, output: AnyType) => {
    if (!output || typeof output !== 'object') return `Finished ${toolName}`;
    const metadataStatus =
        typeof output.metadata === 'object' && output.metadata
            ? output.metadata.status
            : undefined;
    if (typeof metadataStatus === 'string' && metadataStatus !== 'success') {
        if (toolName === 'runSql') {
            return 'Skipped restricted SQL; used table metadata instead';
        }
        return oneLine(`Skipped: ${metadataStatus}`);
    }
    if (toolName === 'getProjectInfo') {
        return 'Project details loaded';
    }
    if (toolName === 'loadProjectContext') {
        return 'Project context loaded';
    }
    if (toolName === 'searchSemanticLayer') {
        return 'Metric search complete';
    }
    if (toolName === 'findFields') {
        return 'Fields checked';
    }
    if (toolName === 'listFields') {
        return 'Field details loaded';
    }
    if (toolName === 'discoverFields') {
        return 'Fields selected';
    }
    if (toolName === 'generateVisualization') {
        return 'Chart ready';
    }
    if (toolName === 'describeWarehouseTable') {
        return 'Table columns loaded';
    }
    if (toolName === 'runSql') {
        const rowCount =
            typeof output.metadata === 'object' && output.metadata
                ? (output.metadata as { rowCount?: number }).rowCount
                : undefined;
        if (typeof rowCount === 'number') {
            return `Returned ${rowCount} ${rowCount === 1 ? 'row' : 'rows'}`;
        }
        return 'Query ran';
    }
    if (toolName === 'editDbtProject') {
        const metadata =
            typeof output.metadata === 'object' && output.metadata
                ? output.metadata
                : {};
        const action = (metadata as { prAction?: string | null }).prAction;
        if (action === 'updated') return 'Pull request updated';
        if (action === 'opened') return 'Pull request opened';
        return 'Writeback complete';
    }
    if (typeof output.rowCount === 'number') {
        return `Returned ${output.rowCount} rows`;
    }
    if (typeof output.result === 'string') {
        return oneLine(output.result);
    }
    if (typeof output.message === 'string') {
        return oneLine(output.message);
    }
    return `Finished ${toolName}`;
};
