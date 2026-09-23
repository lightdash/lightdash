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
import { useState } from 'react';
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
    const canManage =
        user.data?.ability.can(
            'manage',
            subject('AiAgentSkill', { organizationUuid, projectUuid }),
        ) ?? false;
    const canView =
        user.data?.ability.can(
            'view',
            subject('AiAgentSkill', { organizationUuid, projectUuid }),
        ) ?? false;

    const listing = useAgentSkills(projectUuid, agentUuid);
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

    return (
        <Stack gap="sm">
            <Paper p={0}>
                {bound.length === 0 && builtIns.length === 0 ? (
                    <Text size="xs" c="dimmed" ta="center" p="sm">
                        {listing.isLoading
                            ? 'Loading skills…'
                            : 'No skills yet. Users type / in the chat to run one.'}
                    </Text>
                ) : (
                    <Table highlightOnHover>
                        <Table.Tbody>
                            {bound.map((skill) => (
                                <Table.Tr key={skill.uuid}>
                                    <Table.Td>
                                        <Group gap="xs" wrap="nowrap">
                                            <MantineIcon
                                                icon={IconBolt}
                                                color="indigo.6"
                                            />
                                            <Stack gap={0} miw={0}>
                                                <Group gap={6}>
                                                    <Text
                                                        size="sm"
                                                        fw={500}
                                                        ff="monospace"
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
                                                    lineClamp={1}
                                                >
                                                    {skill.description}
                                                </Text>
                                            </Stack>
                                        </Group>
                                    </Table.Td>
                                    <Table.Td w={80} ta="right">
                                        {canManage ? (
                                            <Group
                                                gap={4}
                                                wrap="nowrap"
                                                justify="flex-end"
                                            >
                                                <Tooltip label="Edit skill">
                                                    <ActionIcon
                                                        color="gray"
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
                                                        color="gray"
                                                        loading={
                                                            setSkills.isLoading
                                                        }
                                                        onClick={() =>
                                                            unbind(skill.uuid)
                                                        }
                                                    >
                                                        <MantineIcon
                                                            icon={IconX}
                                                        />
                                                    </ActionIcon>
                                                </Tooltip>
                                            </Group>
                                        ) : null}
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                            {builtIns.map((skill) => (
                                <Table.Tr key={skill.name}>
                                    <Table.Td>
                                        <Group gap="xs" wrap="nowrap">
                                            <MantineIcon
                                                icon={IconBolt}
                                                color="yellow.7"
                                            />
                                            <Stack gap={0} miw={0}>
                                                <Group gap={6}>
                                                    <Text
                                                        size="sm"
                                                        fw={500}
                                                        ff="monospace"
                                                    >
                                                        /{skill.name}
                                                    </Text>
                                                    <Badge
                                                        size="xs"
                                                        color="yellow"
                                                    >
                                                        built-in
                                                    </Badge>
                                                </Group>
                                                <Text
                                                    size="xs"
                                                    c="dimmed"
                                                    lineClamp={1}
                                                >
                                                    {skill.description}
                                                </Text>
                                            </Stack>
                                        </Group>
                                    </Table.Td>
                                    <Table.Td w={80} ta="right">
                                        <Text size="xs" c="dimmed">
                                            Always on
                                        </Text>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                )}
            </Paper>
            {canManage ? (
                <Group gap="xs">
                    <Select
                        size="xs"
                        flex={1}
                        maw={360}
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
                    <Button
                        size="xs"
                        variant="default"
                        leftSection={<MantineIcon icon={IconPlus} />}
                        onClick={() => setModal({ mode: 'create' })}
                    >
                        New skill
                    </Button>
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
