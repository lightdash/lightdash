import {
    Alert,
    Box,
    Group,
    Paper,
    Select,
    Skeleton,
    Stack,
    Text,
    Title,
    Tooltip,
    useMantineTheme,
} from '@mantine-8/core';
import { IconAlertCircle, IconBox, IconInfoCircle } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import useToaster from '../../../../../hooks/toaster/useToaster';
import { useActiveProjectUuid } from '../../../../../hooks/useActiveProject';
import { useProjects } from '../../../../../hooks/useProjects';
import { useProjectAiAgents } from '../../hooks/useProjectAiAgents';
import { useGetUserAgentPreferencesWithDefaults } from '../../hooks/useUserAgentPreferences';
import { useUpdateProjectDefaultAgent } from './useUpdateProjectDefaultAgent';

export const AiAgentsAdminProjectDefaultAgent: FC = () => {
    const theme = useMantineTheme();
    const { showToastSuccess } = useToaster();
    const { activeProjectUuid } = useActiveProjectUuid();
    const { data: projects, isLoading: isLoadingProjects } = useProjects();
    const [selectedProjectUuid, setSelectedProjectUuid] = useState<
        string | null
    >(null);

    useEffect(() => {
        if (activeProjectUuid && selectedProjectUuid === null) {
            setSelectedProjectUuid(activeProjectUuid);
        }
    }, [activeProjectUuid, selectedProjectUuid]);

    const projectUuid = selectedProjectUuid ?? activeProjectUuid ?? null;

    const { data: agents, isLoading: isLoadingAgents } = useProjectAiAgents({
        projectUuid: projectUuid ?? undefined,
        redirectOnUnauthorized: false,
        options: { enabled: !!projectUuid },
    });
    const { data: agentPreferences, isLoading: isLoadingPreferences } =
        useGetUserAgentPreferencesWithDefaults(projectUuid ?? undefined, {
            enabled: !!projectUuid,
        });
    const { mutate: updateProjectDefaultAgent, isLoading: isUpdating } =
        useUpdateProjectDefaultAgent(projectUuid ?? '');

    const projectOptions = useMemo(
        () =>
            projects?.map((project) => ({
                value: project.projectUuid,
                label: project.name,
            })) ?? [],
        [projects],
    );

    const selectedAgent = agents?.find(
        (agent) => agent.uuid === agentPreferences?.projectDefault,
    );

    const selectedAgentHasRestrictions =
        selectedAgent &&
        ((selectedAgent.groupAccess && selectedAgent.groupAccess.length > 0) ||
            (selectedAgent.userAccess && selectedAgent.userAccess.length > 0));

    const handleChange = (agentUuid: string | null) => {
        if (!projectUuid) return;
        updateProjectDefaultAgent(
            { defaultAiAgentUuid: agentUuid },
            {
                onSuccess: () => {
                    showToastSuccess({
                        title: 'Project default agent updated',
                    });
                },
            },
        );
    };

    const isLoading =
        isLoadingProjects ||
        !projectUuid ||
        isLoadingAgents ||
        isLoadingPreferences;

    return (
        <Paper
            p="md"
            mb="sm"
            style={{
                border: `1px solid ${theme.colors.ldGray[2]}`,
                borderRadius: theme.spacing.sm,
                boxShadow: theme.shadows.subtle,
            }}
        >
            <Stack gap="sm">
                <Group justify="space-between" align="flex-start">
                    <Box>
                        <Title order={6}>Project default agent</Title>
                        <Text c="ldGray.6" size="xs">
                            Users without a personal preference will use this
                            agent by default.
                        </Text>
                    </Box>
                    <Select
                        w={220}
                        size="xs"
                        placeholder="Select project"
                        leftSection={<MantineIcon icon={IconBox} size="sm" />}
                        data={projectOptions}
                        value={projectUuid}
                        onChange={setSelectedProjectUuid}
                        disabled={isLoadingProjects}
                        searchable
                    />
                </Group>

                {isLoading ? (
                    <Skeleton height={36} />
                ) : !agents || agents.length === 0 ? (
                    <Text c="ldGray.6" size="sm">
                        No AI agents in this project. Create an agent first to
                        set a default.
                    </Text>
                ) : (
                    <>
                        <Group gap="xs" align="center">
                            <Text fw={500} size="sm">
                                Default agent
                            </Text>
                            <Tooltip
                                label={
                                    <Stack gap="xs">
                                        <Text size="xs" fw={600}>
                                            Fallback chain:
                                        </Text>
                                        <Text size="xs">
                                            1. User preference (if set)
                                            <br />
                                            2. Project default (if set)
                                            <br />
                                            3. First accessible agent
                                        </Text>
                                    </Stack>
                                }
                                multiline
                                w={250}
                            >
                                <Box>
                                    <MantineIcon
                                        icon={IconInfoCircle}
                                        color="ldGray.6"
                                        size="sm"
                                    />
                                </Box>
                            </Tooltip>
                        </Group>

                        <Select
                            placeholder="Select an agent (optional)"
                            size="sm"
                            data={[
                                {
                                    value: 'null',
                                    label: 'No default (let users choose)',
                                },
                                ...agents.map((agent) => ({
                                    value: agent.uuid,
                                    label: agent.name,
                                })),
                            ]}
                            value={agentPreferences?.projectDefault || 'null'}
                            onChange={(value) =>
                                handleChange(value === 'null' ? null : value)
                            }
                            disabled={isUpdating}
                            clearable={false}
                        />

                        {selectedAgentHasRestrictions && (
                            <Alert
                                icon={<MantineIcon icon={IconAlertCircle} />}
                                color="yellow"
                                title="Limited access agent"
                            >
                                This agent has group or user access
                                restrictions. Users who cannot access this agent
                                will automatically fall back to the first
                                available agent.
                            </Alert>
                        )}
                    </>
                )}
            </Stack>
        </Paper>
    );
};
