import { subject } from '@casl/ability';
import { type AiAgentSkillSummary } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Code,
    Combobox,
    Divider,
    Group,
    Menu,
    Paper,
    Stack,
    Text,
    ThemeIcon,
    useCombobox,
} from '@mantine/core';
import {
    IconBooks,
    IconChevronDown,
    IconDots,
    IconFileText,
    IconPencil,
    IconPlus,
    IconSearch,
    IconX,
} from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import InlineErrorState from '../../../../components/common/InlineErrorState';
import MantineIcon from '../../../../components/common/MantineIcon';
import useApp from '../../../../providers/App/useApp';
import {
    useAgentSkills,
    useAiAgentSkills,
    useSetAgentSkills,
} from '../hooks/useAiAgentSkills';
import { AgentSettingsSubsection } from './AgentSettingsSubsection';
import { AiAgentSkillModal } from './AiAgentSkillModal';
import styles from './AiAgentSkillsSection.module.css';

const CREATE_OPTION = '__create__';

type Props = {
    /** Null until the agent is saved: skills bind to an existing agent. */
    agentUuid: string | null;
    projectUuid: string;
    organizationUuid: string;
};

const SkillRow = ({
    name,
    description,
    icon,
    tag,
    menu,
}: {
    name: string;
    description: string;
    icon: typeof IconFileText;
    tag: ReactNode;
    menu: ReactNode;
}) => (
    <Group px="sm" py="xs" gap="sm" wrap="nowrap" align="center">
        <ThemeIcon variant="default" size={28} radius="md">
            <MantineIcon icon={icon} size="sm" color="ldGray.6" />
        </ThemeIcon>
        <Stack gap={0} flex={1} miw={0}>
            <Group gap={6} align="center">
                <Code fz="xs">/{name}</Code>
                {tag}
            </Group>
            <Text size="xs" c="dimmed" truncate="end">
                {description}
            </Text>
        </Stack>
        {menu}
    </Group>
);

const AddSkillMenu = ({
    bindable,
    canBind,
    canCreate,
    onBind,
    onCreate,
}: {
    bindable: AiAgentSkillSummary[];
    canBind: boolean;
    canCreate: boolean;
    onBind: (skillUuid: string) => void;
    onCreate: () => void;
}) => {
    const combobox = useCombobox({
        onDropdownClose: () => {
            combobox.resetSelectedOption();
            setSearch('');
        },
    });
    const [search, setSearch] = useState('');
    const needle = search.trim().toLowerCase();
    const matches = bindable.filter(
        (skill) =>
            needle.length === 0 ||
            skill.name.includes(needle) ||
            skill.description.toLowerCase().includes(needle),
    );

    return (
        <Combobox
            store={combobox}
            withinPortal
            width={320}
            position="bottom-end"
            onOptionSubmit={(value) => {
                combobox.closeDropdown();
                if (value === CREATE_OPTION) {
                    onCreate();
                } else {
                    onBind(value);
                }
            }}
        >
            <Combobox.Target>
                <Button
                    size="xs"
                    variant="default"
                    leftSection={<MantineIcon icon={IconBooks} />}
                    rightSection={<MantineIcon icon={IconChevronDown} />}
                    onClick={() => combobox.toggleDropdown()}
                >
                    Library
                </Button>
            </Combobox.Target>
            <Combobox.Dropdown>
                {canBind && bindable.length > 0 ? (
                    <>
                        <Combobox.Search
                            size="xs"
                            value={search}
                            onChange={(event) =>
                                setSearch(event.currentTarget.value)
                            }
                            placeholder="Search library"
                            leftSection={
                                <MantineIcon icon={IconSearch} color="dimmed" />
                            }
                            classNames={{
                                wrapper: styles.searchWrapper,
                                input: styles.searchInput,
                            }}
                        />
                        <Combobox.Options
                            mah={280}
                            className={styles.scrollableOptions}
                        >
                            {matches.map((skill) => (
                                <Combobox.Option
                                    key={skill.uuid}
                                    value={skill.uuid}
                                >
                                    <Stack gap={2} miw={0}>
                                        <Group gap={6} wrap="nowrap">
                                            <Text
                                                size="xs"
                                                fw={500}
                                                ff="monospace"
                                                truncate="end"
                                            >
                                                /{skill.name}
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                v
                                                {
                                                    skill.currentVersion
                                                        .versionNumber
                                                }
                                            </Text>
                                        </Group>
                                        <Text
                                            size="xs"
                                            c="dimmed"
                                            truncate="end"
                                        >
                                            {skill.description}
                                        </Text>
                                    </Stack>
                                </Combobox.Option>
                            ))}
                            {matches.length === 0 ? (
                                <Combobox.Empty>
                                    <Text size="xs" c="dimmed" py="xs">
                                        No skill matches "{search.trim()}"
                                    </Text>
                                </Combobox.Empty>
                            ) : null}
                        </Combobox.Options>
                    </>
                ) : (
                    <Stack align="center" gap={4} py="md" px="md">
                        <MantineIcon
                            icon={IconBooks}
                            size="md"
                            color="ldGray.5"
                        />
                        <Text size="xs" fw={500}>
                            No skills to add
                        </Text>
                        <Text size="xs" c="dimmed" ta="center">
                            Skills you create are saved to the library so any
                            agent can use them.
                        </Text>
                    </Stack>
                )}
                {canCreate ? (
                    <Combobox.Footer p={4}>
                        <Combobox.Option value={CREATE_OPTION}>
                            <Group gap={6} wrap="nowrap">
                                <MantineIcon icon={IconPlus} size="sm" />
                                <Text size="xs" fw={500}>
                                    Create new skill
                                </Text>
                            </Group>
                        </Combobox.Option>
                    </Combobox.Footer>
                ) : null}
            </Combobox.Dropdown>
        </Combobox>
    );
};

/**
 * The skills bound to this agent. They can be edited and removed, and a new
 * skill created here is bound on save.
 */
export const AiAgentSkillsSection = ({
    agentUuid,
    projectUuid,
    organizationUuid,
}: Props) => {
    const { user } = useApp();
    const ability = user.data?.ability;
    const projectSkillSubject = subject('AiAgentSkill', {
        organizationUuid,
        projectUuid,
    });
    const canManage = ability?.can('manage', projectSkillSubject) ?? false;
    const canView = ability?.can('view', projectSkillSubject) ?? false;
    // A skill created here has no project, so it needs the organization-level grant.
    const canCreate =
        ability?.can('manage', subject('AiAgentSkill', { organizationUuid })) ??
        false;

    const listing = useAgentSkills(
        projectUuid,
        agentUuid ?? undefined,
        agentUuid !== null,
    );
    const catalogue = useAiAgentSkills(projectUuid, canView);
    const setSkills = useSetAgentSkills(projectUuid, agentUuid ?? '');
    const [modal, setModal] = useState<
        { mode: 'create' } | { mode: 'edit'; skill: AiAgentSkillSummary } | null
    >(null);

    const bound = listing.data?.skills ?? [];
    const boundUuids = bound.map((skill) => skill.uuid);
    const bindable = (catalogue.data ?? []).filter(
        (skill) => !boundUuids.includes(skill.uuid),
    );

    const bind = (skillUuid: string) =>
        setSkills.mutate([...boundUuids, skillUuid]);
    const unbind = (skillUuid: string) =>
        setSkills.mutate(boundUuids.filter((uuid) => uuid !== skillUuid));

    const body = (() => {
        if (agentUuid === null) {
            return (
                <Paper variant="dotted" p="sm">
                    <Text size="xs" c="dimmed" ta="center">
                        You can add skills once this agent is created.
                    </Text>
                </Paper>
            );
        }
        if (listing.isError) {
            return (
                <InlineErrorState
                    message={
                        listing.error.error.message ??
                        'Could not load this agent’s skills'
                    }
                />
            );
        }
        if (listing.isLoading) {
            return (
                <Text size="xs" c="dimmed" ta="center" p="sm">
                    Loading skills…
                </Text>
            );
        }
        const rows: ReactNode[] = [
            ...bound.map((skill) => (
                <SkillRow
                    key={skill.uuid}
                    name={skill.name}
                    description={skill.description}
                    icon={IconFileText}
                    tag={
                        <Text size="xs" c="dimmed">
                            v{skill.currentVersion.versionNumber}
                        </Text>
                    }
                    menu={
                        canManage ? (
                            <Menu position="bottom-end" withinPortal>
                                <Menu.Target>
                                    <ActionIcon
                                        aria-label={`Actions for /${skill.name}`}
                                        loading={setSkills.isLoading}
                                    >
                                        <MantineIcon icon={IconDots} />
                                    </ActionIcon>
                                </Menu.Target>
                                <Menu.Dropdown>
                                    <Menu.Item
                                        leftSection={
                                            <MantineIcon icon={IconPencil} />
                                        }
                                        onClick={() =>
                                            setModal({ mode: 'edit', skill })
                                        }
                                    >
                                        Edit skill
                                    </Menu.Item>
                                    <Menu.Item
                                        color="red"
                                        leftSection={
                                            <MantineIcon icon={IconX} />
                                        }
                                        onClick={() => unbind(skill.uuid)}
                                    >
                                        Remove from this agent
                                    </Menu.Item>
                                </Menu.Dropdown>
                            </Menu>
                        ) : null
                    }
                />
            )),
            ...(bound.length === 0
                ? [
                      <Text key="empty" size="xs" c="dimmed" p="sm">
                          No skills added to this agent yet.
                      </Text>,
                  ]
                : []),
        ];
        return (
            <Paper p={0}>
                <Stack gap={0}>
                    {rows.map((row, index) => (
                        <Box key={index}>
                            {index > 0 ? <Divider /> : null}
                            {row}
                        </Box>
                    ))}
                </Stack>
            </Paper>
        );
    })();

    const showAction =
        agentUuid !== null && !listing.isError && (canManage || canCreate);

    return (
        <AgentSettingsSubsection
            title="Skills"
            description="Step-by-step instructions for recurring tasks. The agent picks one up when a request matches, or users run one by typing / in the chat."
            action={
                showAction ? (
                    <AddSkillMenu
                        bindable={bindable}
                        canBind={canManage}
                        canCreate={canCreate}
                        onBind={bind}
                        onCreate={() => setModal({ mode: 'create' })}
                    />
                ) : null
            }
        >
            {body}
            {modal ? (
                <AiAgentSkillModal
                    skill={modal.mode === 'edit' ? modal.skill : null}
                    bindToAgentUuid={modal.mode === 'create' ? agentUuid : null}
                    onClose={() => setModal(null)}
                />
            ) : null}
        </AgentSettingsSubsection>
    );
};
