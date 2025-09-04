import {
    ActionIcon,
    Button,
    Checkbox,
    Group,
    Popover,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { IconRobotFace, IconX } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useAiAgentAdminAgents } from '../../hooks/useAiAgentAdmin';
import classes from './AgentsFilter.module.css';

type AgentsFilterProps = {
    selectedAgentUuids: string[];
    setSelectedAgentUuids: (agentUuids: string[]) => void;
};

const AgentsFilter: FC<AgentsFilterProps> = ({
    selectedAgentUuids,
    setSelectedAgentUuids,
}) => {
    const hasSelectedAgents = selectedAgentUuids.length > 0;

    const organizationAiAgents = useAiAgentAdminAgents();

    const agentNames = useMemo(() => {
        if (!organizationAiAgents.data) return '';
        return organizationAiAgents.data
            ?.filter((agent) => selectedAgentUuids.includes(agent.uuid))
            .map((agent) => agent.name)
            .join(', ');
    }, [organizationAiAgents?.data, selectedAgentUuids]);

    const buttonLabel = hasSelectedAgents ? agentNames : 'All agents';

    return (
        <Group gap="two">
            <Popover width={300} position="bottom-start">
                <Popover.Target>
                    <Tooltip
                        withinPortal
                        variant="xs"
                        label="Filter threads by AI agent"
                    >
                        <Button
                            h={32}
                            c="gray.7"
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
                                            : 'gray.5'
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
                        <Text fz="xs" c="dark.3" fw={600}>
                            Filter by AI agents:
                        </Text>

                        {organizationAiAgents.data?.length === 0 && (
                            <Text fz="xs" fw={500} c="gray.6">
                                No agents available.
                            </Text>
                        )}

                        <Stack gap="xs">
                            {organizationAiAgents.data?.map((agent) => (
                                <Checkbox
                                    key={agent.uuid}
                                    label={
                                        <Group gap="xs" wrap="nowrap">
                                            <LightdashUserAvatar
                                                size={16}
                                                variant="filled"
                                                name={agent.name}
                                                src={agent.imageUrl}
                                            />
                                            <Text fz="sm" fw={400}>
                                                {agent.name}
                                            </Text>
                                        </Group>
                                    }
                                    checked={selectedAgentUuids.includes(
                                        agent.uuid,
                                    )}
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
                                                    (uuid) =>
                                                        uuid !== agent.uuid,
                                                ),
                                            );
                                        } else {
                                            setSelectedAgentUuids([
                                                ...selectedAgentUuids,
                                                agent.uuid,
                                            ]);
                                        }
                                    }}
                                />
                            ))}
                        </Stack>
                    </Stack>
                </Popover.Dropdown>
            </Popover>
            {hasSelectedAgents && (
                <Tooltip variant="xs" label="Clear all agent filters">
                    <ActionIcon
                        size="xs"
                        color="gray.5"
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
