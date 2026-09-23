import { subject } from '@casl/ability';
import { type AiAgentSkillSummary } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Group,
    Paper,
    Select,
    Stack,
    Table,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconBolt, IconPencil, IconPlus, IconX } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import InlineErrorState from '../../../../components/common/InlineErrorState';
import MantineIcon from '../../../../components/common/MantineIcon';
import useApp from '../../../../providers/App/useApp';
import {
    useAgentSkills,
    useAiAgentSkills,
    useSetAgentSkills,
} from '../hooks/useAiAgentSkills';
import { AiAgentSkillModal } from './AiAgentSkillModal';

type Props = {
    agentUuid: string;
    projectUuid: string;
    organizationUuid: string;
};

const SkillRow = ({
    name,
    description,
    iconColor,
    tag,
    actions,
}: {
    name: string;
    description: string;
    iconColor: string;
    tag: ReactNode;
    actions: ReactNode;
}) => (
    <Table.Tr>
        <Table.Td>
            <Group gap="xs" wrap="nowrap">
                <MantineIcon icon={IconBolt} color={iconColor} />
                <Stack gap={0} miw={0}>
                    <Group gap={6}>
                        <Text size="sm" fw={500} ff="monospace">
                            /{name}
                        </Text>
                        {tag}
                    </Group>
                    <Text size="xs" c="dimmed" lineClamp={1}>
                        {description}
                    </Text>
                </Stack>
            </Group>
        </Table.Td>
        <Table.Td w={80} ta="right">
            {actions}
        </Table.Td>
    </Table.Tr>
);

/**
 * The skills this agent serves. Bound custom skills can be removed and edited,
 * built-ins are always on, and a new skill created here is bound on save.
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

    const listing = useAgentSkills(projectUuid, agentUuid, true);
    const catalogue = useAiAgentSkills(projectUuid, canView);
    const setSkills = useSetAgentSkills(projectUuid, agentUuid);
    const [modal, setModal] = useState<
        { mode: 'create' } | { mode: 'edit'; skill: AiAgentSkillSummary } | null
    >(null);

    const bound = listing.data?.skills ?? [];
    const builtIns = listing.data?.builtInSkills ?? [];
    const boundUuids = bound.map((skill) => skill.uuid);
    const bindable = (catalogue.data ?? []).filter(
        (skill) => !boundUuids.includes(skill.uuid),
    );

    const bind = (skillUuid: string) =>
        setSkills.mutate([...boundUuids, skillUuid]);
    const unbind = (skillUuid: string) =>
        setSkills.mutate(boundUuids.filter((uuid) => uuid !== skillUuid));

    const body = (() => {
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
        return (
            <Table highlightOnHover>
                <Table.Tbody>
                    {bound.map((skill) => (
                        <SkillRow
                            key={skill.uuid}
                            name={skill.name}
                            description={skill.description}
                            iconColor="indigo.6"
                            tag={
                                <Text size="xs" c="dimmed">
                                    v{skill.currentVersion.versionNumber}
                                </Text>
                            }
                            actions={
                                canManage ? (
                                    <Group
                                        gap={4}
                                        wrap="nowrap"
                                        justify="flex-end"
                                    >
                                        <Tooltip label="Edit skill">
                                            <ActionIcon
                                                aria-label={`Edit /${skill.name}`}
                                                onClick={() =>
                                                    setModal({
                                                        mode: 'edit',
                                                        skill,
                                                    })
                                                }
                                            >
                                                <MantineIcon
                                                    icon={IconPencil}
                                                />
                                            </ActionIcon>
                                        </Tooltip>
                                        <Tooltip label="Remove from this agent">
                                            <ActionIcon
                                                aria-label={`Remove /${skill.name} from this agent`}
                                                loading={setSkills.isLoading}
                                                onClick={() =>
                                                    unbind(skill.uuid)
                                                }
                                            >
                                                <MantineIcon icon={IconX} />
                                            </ActionIcon>
                                        </Tooltip>
                                    </Group>
                                ) : null
                            }
                        />
                    ))}
                    {bound.length === 0 ? (
                        <Table.Tr>
                            <Table.Td colSpan={2}>
                                <Text size="xs" c="dimmed">
                                    No custom skills bound yet.
                                </Text>
                            </Table.Td>
                        </Table.Tr>
                    ) : null}
                    {builtIns.map((skill) => (
                        <SkillRow
                            key={skill.name}
                            name={skill.name}
                            description={skill.description}
                            iconColor="yellow.7"
                            tag={
                                <Badge size="xs" color="yellow">
                                    built-in
                                </Badge>
                            }
                            actions={
                                <Text size="xs" c="dimmed">
                                    Always on
                                </Text>
                            }
                        />
                    ))}
                </Table.Tbody>
            </Table>
        );
    })();

    return (
        <Stack gap="sm">
            <Paper p={0}>{body}</Paper>
            {canManage || canCreate ? (
                <Group gap="xs">
                    {canManage ? (
                        <Select
                            size="xs"
                            flex={1}
                            maw={360}
                            aria-label="Add an existing skill"
                            placeholder={
                                bindable.length
                                    ? 'Add an existing skill'
                                    : 'No other skills in the library'
                            }
                            data={bindable.map((skill) => ({
                                value: skill.uuid,
                                label: `/${skill.name}${
                                    skill.title ? ` — ${skill.title}` : ''
                                }`,
                            }))}
                            searchable
                            value={null}
                            disabled={bindable.length === 0}
                            onChange={(value) => value && bind(value)}
                        />
                    ) : null}
                    {canCreate ? (
                        <Button
                            size="xs"
                            variant="default"
                            leftSection={<MantineIcon icon={IconPlus} />}
                            onClick={() => setModal({ mode: 'create' })}
                        >
                            New skill
                        </Button>
                    ) : null}
                </Group>
            ) : null}
            {modal ? (
                <AiAgentSkillModal
                    skill={modal.mode === 'edit' ? modal.skill : null}
                    bindToAgentUuid={modal.mode === 'create' ? agentUuid : null}
                    onClose={() => setModal(null)}
                />
            ) : null}
        </Stack>
    );
};
