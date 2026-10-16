import {
    isToolName,
    type AiAgentToolName,
    type ToolName,
} from '@lightdash/common';
import i18n from '../../../../../../../i18n/i18n';
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

type ToolCallGroupDefinition = {
    key: string;
    /** Key under `toolGroups` in the aiCopilotChat namespace. */
    labelKey: string;
    representativeToolName: ToolName;
    toolNames: readonly ToolName[];
};

const TOOL_CALL_GROUP_DEFINITIONS: ToolCallGroupDefinition[] = [
    {
        key: 'data-model-search',
        labelKey: 'dataModelSearch',
        representativeToolName: 'findFields',
        toolNames: ['findExplores', 'findFields', 'searchSemanticLayer'],
    },
    {
        key: 'content-search',
        labelKey: 'contentSearch',
        representativeToolName: 'findContent',
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
        labelKey: 'warehouseInspection',
        representativeToolName: 'listWarehouseTables',
        toolNames: ['listWarehouseTables', 'describeWarehouseTable'],
    },
    {
        key: 'knowledge-search',
        labelKey: 'knowledgeSearch',
        representativeToolName: 'listKnowledgeDocuments',
        toolNames: ['listKnowledgeDocuments', 'getKnowledgeDocumentContent'],
    },
    {
        key: 'chart-build',
        labelKey: 'chartBuild',
        representativeToolName: 'generateVisualization',
        toolNames: [
            'generateVisualization',
            'runQuery',
            'runContentQuery',
            'runSavedChart',
        ],
    },
    {
        key: 'project-context',
        labelKey: 'projectContext',
        representativeToolName: 'loadProjectContext',
        toolNames: [
            'listProjects',
            'getProjectInfo',
            'loadSkill',
            'loadProjectContext',
        ],
    },
    {
        key: 'content-editing',
        labelKey: 'contentEditing',
        representativeToolName: 'editContent',
        toolNames: ['editContent', 'createContent'],
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
        doneLabel: i18n.t(`toolGroups.${firstDefinition.labelKey}.done`, {
            ns: 'aiCopilotChat',
        }),
        liveLabel: i18n.t(`toolGroups.${firstDefinition.labelKey}.live`, {
            ns: 'aiCopilotChat',
        }),
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
