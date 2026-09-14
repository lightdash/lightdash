const AGENT_SETTINGS_SECTION_IDS = [
    'identity',
    'behaviour',
    'knowledge-and-data',
    'permissions',
    'integrations',
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
    { id: 'knowledge-and-data', label: 'Knowledge & data', editOnly: false },
    { id: 'permissions', label: 'Permissions', editOnly: false },
    { id: 'integrations', label: 'Integrations', editOnly: false },
    { id: 'danger-zone', label: 'Danger zone', editOnly: true },
];

export const getAgentSettingsSections = (
    mode: 'create' | 'edit',
): AgentSettingsSectionMeta[] =>
    mode === 'edit'
        ? SECTIONS
        : SECTIONS.filter((section) => !section.editOnly);
