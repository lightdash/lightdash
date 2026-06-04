import {
    isToolName,
    type AiAgentToolName,
    type ToolName,
} from '@lightdash/common';
import { type ToolCallSummary } from './types';

export type ToolCallGroupDisplay = {
    doneLabel: string;
    liveLabel: string;
};

export type ToolCallActivityGroup = {
    toolName: AiAgentToolName;
    calls: ToolCallSummary[];
    keyId: string;
    display?: ToolCallGroupDisplay;
};

type ToolCallGroupDefinition = ToolCallGroupDisplay & {
    key: string;
    representativeToolName: ToolName;
    toolNames: readonly ToolName[];
};

const TOOL_CALL_GROUP_DEFINITIONS: ToolCallGroupDefinition[] = [
    {
        key: 'data-model-search',
        representativeToolName: 'findFields',
        liveLabel: 'Searching the data model',
        doneLabel: 'Searched the data model',
        toolNames: ['findExplores', 'findFields', 'searchSemanticLayer'],
    },
    {
        key: 'content-search',
        representativeToolName: 'findContent',
        liveLabel: 'Finding relevant content',
        doneLabel: 'Found relevant content',
        toolNames: [
            'findContent',
            'listContent',
            'findDashboards',
            'findCharts',
            'getDashboardCharts',
        ],
    },
    {
        key: 'warehouse-inspection',
        representativeToolName: 'listWarehouseTables',
        liveLabel: 'Inspecting warehouse tables',
        doneLabel: 'Inspected warehouse tables',
        toolNames: ['listWarehouseTables', 'describeWarehouseTable'],
    },
    {
        key: 'knowledge-search',
        representativeToolName: 'listKnowledgeDocuments',
        liveLabel: 'Reading knowledge documents',
        doneLabel: 'Read knowledge documents',
        toolNames: ['listKnowledgeDocuments', 'getKnowledgeDocumentContent'],
    },
    {
        key: 'chart-build',
        representativeToolName: 'generateVisualization',
        liveLabel: 'Building a chart',
        doneLabel: 'Built a chart',
        toolNames: [
            'generateVisualization',
            'runQuery',
            'runContentQuery',
            'runSavedChart',
            'generateBarVizConfig',
            'generateTableVizConfig',
            'generateTimeSeriesVizConfig',
        ],
    },
    {
        key: 'project-context',
        representativeToolName: 'loadProjectContext',
        liveLabel: 'Loading project context',
        doneLabel: 'Loaded project context',
        toolNames: [
            'listProjects',
            'getProjectInfo',
            'loadSkill',
            'loadProjectContext',
        ],
    },
    {
        key: 'content-editing',
        representativeToolName: 'editContent',
        liveLabel: 'Editing content',
        doneLabel: 'Edited content',
        toolNames: ['readContent', 'editContent', 'createContent'],
    },
];

const TOOL_NAME_TO_GROUP = new Map(
    TOOL_CALL_GROUP_DEFINITIONS.flatMap((definition) =>
        definition.toolNames.map((toolName) => [toolName, definition] as const),
    ),
);

const getToolCallGroupDefinition = (toolName: AiAgentToolName) =>
    isToolName(toolName) ? TOOL_NAME_TO_GROUP.get(toolName) : undefined;

const getToolCallGroupKey = (toolName: AiAgentToolName) =>
    getToolCallGroupDefinition(toolName)?.key ?? toolName;

const getToolCallGroupDisplay = (
    calls: ToolCallSummary[],
): ToolCallGroupDisplay | undefined => {
    const toolNames = new Set(calls.map((call) => call.toolName));
    if (toolNames.size <= 1) return undefined;

    const definitions = [...toolNames].map(getToolCallGroupDefinition);
    const firstDefinition = definitions[0];
    if (
        !firstDefinition ||
        definitions.some((definition) => definition !== firstDefinition)
    ) {
        return undefined;
    }

    return {
        doneLabel: firstDefinition.doneLabel,
        liveLabel: firstDefinition.liveLabel,
    };
};

const getRepresentativeToolName = (
    calls: ToolCallSummary[],
): AiAgentToolName => {
    const toolNames = new Set(calls.map((call) => call.toolName));
    if (toolNames.size <= 1) return calls[0].toolName;

    const latestToolName = calls[calls.length - 1]?.toolName;
    const definition = latestToolName
        ? getToolCallGroupDefinition(latestToolName)
        : undefined;
    return definition?.representativeToolName ?? latestToolName;
};

const updateGroupMetadata = (group: ToolCallActivityGroup) => {
    group.toolName = getRepresentativeToolName(group.calls);
    group.display = getToolCallGroupDisplay(group.calls);
};

export const canAppendToolCallToActivityGroup = (
    group: ToolCallActivityGroup,
    call: ToolCallSummary,
) =>
    getToolCallGroupKey(group.calls[0].toolName) ===
    getToolCallGroupKey(call.toolName);

export const createToolCallActivityGroup = (
    call: ToolCallSummary,
): ToolCallActivityGroup => ({
    toolName: call.toolName,
    calls: [call],
    keyId: call.toolCallId,
});

export const appendToolCallToActivityGroup = (
    group: ToolCallActivityGroup,
    call: ToolCallSummary,
) => {
    group.calls.push(call);
    updateGroupMetadata(group);
};

const appendToolCallToActivityGroups = (
    groups: ToolCallActivityGroup[],
    call: ToolCallSummary,
) => {
    const last = groups[groups.length - 1];

    if (last && canAppendToolCallToActivityGroup(last, call)) {
        appendToolCallToActivityGroup(last, call);
        return groups;
    }

    groups.push(createToolCallActivityGroup(call));
    return groups;
};

export const groupToolCallSummaries = (
    calls: ToolCallSummary[],
): ToolCallActivityGroup[] =>
    calls.reduce<ToolCallActivityGroup[]>(
        (groups, call) => appendToolCallToActivityGroups(groups, call),
        [],
    );
