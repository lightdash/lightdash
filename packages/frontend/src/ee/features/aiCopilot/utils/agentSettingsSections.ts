const AGENT_SETTINGS_SECTION_IDS = [
    'identity',
    'behaviour',
    'knowledge',
    'data-access',
    'who-can-use',
    'mcp-servers',
    'slack',
    'danger-zone',
] as const;

export type AgentSettingsSectionId =
    (typeof AGENT_SETTINGS_SECTION_IDS)[number];

type AgentSettingsSectionMeta = {
    id: AgentSettingsSectionId;
    label: string;
    /** Sections that only exist once the agent has been created. */
    editOnly: boolean;
};

const SECTIONS: AgentSettingsSectionMeta[] = [
    { id: 'identity', label: 'Identity', editOnly: false },
    { id: 'behaviour', label: 'Behaviour', editOnly: false },
    { id: 'knowledge', label: 'Knowledge', editOnly: true },
    { id: 'data-access', label: 'Data access', editOnly: false },
    { id: 'who-can-use', label: 'Who can use it', editOnly: false },
    { id: 'mcp-servers', label: 'MCP servers', editOnly: false },
    { id: 'slack', label: 'Slack', editOnly: false },
    { id: 'danger-zone', label: 'Danger zone', editOnly: true },
];

export const getAgentSettingsSections = (
    mode: 'create' | 'edit',
): AgentSettingsSectionMeta[] =>
    mode === 'edit'
        ? SECTIONS
        : SECTIONS.filter((section) => !section.editOnly);
