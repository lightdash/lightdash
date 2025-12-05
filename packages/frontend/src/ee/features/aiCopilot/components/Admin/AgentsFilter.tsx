import type { AiAgentSummary } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Checkbox,
    Group,
    Popover,
    ScrollArea,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { IconRobotFace, IconX } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useProjects } from '../../../../../hooks/useProjects';
import { useAiAgentAdminAgents } from '../../hooks/useAiAgentAdmin';
import { type useAiAgentAdminFilters } from '../../hooks/useAiAgentAdminFilters';
import classes from './AgentsFilter.module.css';

type AgentsFilterProps = Pick<
    ReturnType<typeof useAiAgentAdminFilters>,
    'selectedAgentUuids' | 'setSelectedAgentUuids' | 'selectedProjectUuids'
>;

const AgentsFilter: FC<AgentsFilterProps> = ({
    selectedAgentUuids,
    setSelectedAgentUuids,
    selectedProjectUuids,
}) => {
    const organizationAiAgents = useAiAgentAdminAgents();
    const { data: projects } = useProjects();

    const hasSelectedProjects = selectedProjectUuids.length > 0;

    const groupedAgents = useMemo(() => {
        if (!organizationAiAgents.data || !projects) return {};

        const groups: Record<string, AiAgentSummary[]> = {};

        organizationAiAgents.data.forEach((agent) => {
            const projectUuid = agent.projectUuid;
            if (!groups[projectUuid]) {
                groups[projectUuid] = [];
            }
            groups[projectUuid].push(agent);
        });

        return groups;
    }, [organizationAiAgents, projects]);

    const getProjectName = (projectUuid: string) => {
        const project = projects?.find((p) => p.projectUuid === projectUuid);
        return project?.name;
    };

    const effectiveSelectedAgentUuids = useMemo(() => {
        if (!hasSelectedProjects) {
            return selectedAgentUuids;
        }

        if (!organizationAiAgents.data) {
            return [];
        }

        const validAgentUuids = new Set(
            organizationAiAgents.data
                .filter((agent) =>
                    selectedProjectUuids.includes(agent.projectUuid),
                )
                .map((agent) => agent.uuid),
        );

        return selectedAgentUuids.filter((uuid) => validAgentUuids.has(uuid));
    }, [
        hasSelectedProjects,
        organizationAiAgents.data,
        selectedProjectUuids,
        selectedAgentUuids,
    ]);

    const hasSelectedAgents = effectiveSelectedAgentUuids.length > 0;

    const agentNames = useMemo(() => {
        if (!organizationAiAgents.data) return '';
        return organizationAiAgents.data
            ?.filter((agent) =>
                effectiveSelectedAgentUuids.includes(agent.uuid),
            )
            .map((agent) => agent.name)
            .join(', ');
    }, [organizationAiAgents?.data, effectiveSelectedAgentUuids]);

    const buttonLabel = hasSelectedAgents ? agentNames : 'All agents';

    return (
        <Group gap="two">
            <Popover width={300} position="bottom-start">
                <Popover.Target>
                    <Tooltip
                        withinPortal
                        variant="xs"
                        label={
                            hasSelectedProjects
                                ? 'Filter threads by AI agent (filtered by selected projects)'
                                : 'Filter threads by AI agent'
                        }
                    >
                        <Button
                            h={32}
                            c="ldGray.7"
                            fw={500}
                            fz="sm"
                            variant="default"
                            radius="md"
                            py="xs"
                            px="sm"
                            leftSection={
                                <MantineIcon
                                    icon={IconRobotFace}
                                    size="md"
                                    color={
                                        hasSelectedAgents
                                            ? 'indigo.5'
                                            : 'ldGray.5'
                                    }
                                />
                            }
                            loading={organizationAiAgents.isLoading}
                            className={
                                hasSelectedAgents
                                    ? classes.filterButtonSelected
                                    : classes.filterButton
                            }
                            classNames={{
                                label: classes.buttonLabel,
                            }}
                        >
                            {buttonLabel}
                        </Button>
                    </Tooltip>
                </Popover.Target>
                <Popover.Dropdown p="sm">
                    <Stack gap={4}>
                        <Text fz="xs" c="ldDark.9" fw={600}>
                            Filter by AI agents:
                        </Text>
                        {hasSelectedProjects && (
                            <Text fz="xs" c="blue.6" fw={500}>
                                Showing agents from selected projects only
                            </Text>
                        )}

                        {organizationAiAgents.data?.length === 0 && (
                            <Text fz="xs" fw={500} c="ldGray.6">
                                No agents available.
                            </Text>
                        )}

                        <ScrollArea.Autosize
                            mah={200}
                            type="always"
                            scrollbars="y"
                        >
                            <Stack gap="xs">
                                {Object.entries(groupedAgents).map(
                                    ([projectUuid, agents]) => (
                                        <Stack key={projectUuid} gap="xs">
                                            <Text fz="xs" fw={400} c="dimmed">
                                                {getProjectName(projectUuid)}
                                            </Text>
                                            <Stack gap="two" pl="sm">
                                                {agents.map((agent) => {
                                                    const isAgentInSelectedProjects =
                                                        !hasSelectedProjects ||
                                                        selectedProjectUuids.includes(
                                                            agent.projectUuid,
                                                        );

                                                    return (
                                                        <Checkbox
                                                            key={agent.uuid}
                                                            label={
                                                                <Group
                                                                    gap="two"
                                                                    wrap="nowrap"
                                                                >
                                                                    <LightdashUserAvatar
                                                                        size={
                                                                            16
                                                                        }
                                                                        name={
                                                                            agent.name
                                                                        }
                                                                        src={
                                                                            agent.imageUrl
                                                                        }
                                                                    />
                                                                    <Text
                                                                        fz="xs"
                                                                        fw={400}
                                                                        c={
                                                                            isAgentInSelectedProjects
                                                                                ? undefined
                                                                                : 'ldGray.5'
                                                                        }
                                                                    >
                                                                        {
                                                                            agent.name
                                                                        }
                                                                    </Text>
                                                                </Group>
                                                            }
                                                            checked={effectiveSelectedAgentUuids.includes(
                                                                agent.uuid,
                                                            )}
                                                            disabled={
                                                                !isAgentInSelectedProjects
                                                            }
                                                            size="xs"
                                                            classNames={{
                                                                body: classes.checkboxBody,
                                                                input: classes.checkboxInput,
                                                                label: classes.checkboxLabel,
                                                            }}
                                                            onChange={() => {
                                                                if (
                                                                    selectedAgentUuids.includes(
                                                                        agent.uuid,
                                                                    )
                                                                ) {
                                                                    setSelectedAgentUuids(
                                                                        selectedAgentUuids.filter(
                                                                            (
                                                                                uuid,
                                                                            ) =>
                                                                                uuid !==
                                                                                agent.uuid,
                                                                        ),
                                                                    );
                                                                } else {
                                                                    setSelectedAgentUuids(
                                                                        [
                                                                            ...selectedAgentUuids,
                                                                            agent.uuid,
                                                                        ],
                                                                    );
                                                                }
                                                            }}
                                                        />
                                                    );
                                                })}
                                            </Stack>
                                        </Stack>
                                    ),
                                )}
                            </Stack>
                        </ScrollArea.Autosize>
                    </Stack>
                </Popover.Dropdown>
            </Popover>
            {hasSelectedAgents && (
                <Tooltip variant="xs" label="Clear all agent filters">
                    <ActionIcon
                        size="xs"
                        color="ldGray.5"
                        variant="subtle"
                        onClick={() => {
                            setSelectedAgentUuids([]);
                        }}
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Tooltip>
            )}
        </Group>
    );
};

export default AgentsFilter;
