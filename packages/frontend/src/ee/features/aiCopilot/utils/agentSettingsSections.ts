import { type TFunction } from 'i18next';

const AGENT_SETTINGS_SECTION_IDS = [
    'identity',
    'behaviour',
    'knowledge-and-data',
    'capabilities',
    'access-and-privacy',
    'connections',
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

const SECTIONS: Omit<AgentSettingsSectionMeta, 'label'>[] = [
    { id: 'identity', editOnly: false },
    { id: 'behaviour', editOnly: false },
    { id: 'knowledge-and-data', editOnly: false },
    { id: 'capabilities', editOnly: false },
    { id: 'access-and-privacy', editOnly: false },
    { id: 'connections', editOnly: false },
    { id: 'danger-zone', editOnly: true },
];

const SECTION_LABEL_KEYS: Record<AgentSettingsSectionId, string> = {
    identity: 'settingsSections.identity',
    behaviour: 'settingsSections.behaviour',
    'knowledge-and-data': 'settingsSections.knowledgeAndData',
    capabilities: 'settingsSections.capabilities',
    'access-and-privacy': 'settingsSections.accessAndPrivacy',
    connections: 'settingsSections.connections',
    'danger-zone': 'settingsSections.dangerZone',
};

export const getAgentSettingsSections = (
    mode: 'create' | 'edit',
    t: TFunction,
): AgentSettingsSectionMeta[] =>
    SECTIONS.filter((section) => mode === 'edit' || !section.editOnly).map(
        (section) => ({
            ...section,
            label: t(SECTION_LABEL_KEYS[section.id], { ns: 'aiAgent' }),
        }),
    );
