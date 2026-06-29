import { Group, Select, Stack, Switch, Textarea } from '@mantine-8/core';
import { IconSparkles } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useAiAgentButtonVisibility } from '../../../../ee/features/aiCopilot/hooks/useAiAgentsButtonVisibility';
import { useProjectAiAgents } from '../../../../ee/features/aiCopilot/hooks/useProjectAiAgents';
import { useSchedulerFormContext } from './schedulerFormContext';

type Props = {
    projectUuid: string | undefined;
    sourceThreadUuid?: string | null;
};

// Renders nothing when AI agents aren't available for this project.
export const SchedulerFormAiInput: FC<Props> = ({
    projectUuid,
    sourceThreadUuid,
}) => {
    const form = useSchedulerFormContext();
    const isAiVisible = useAiAgentButtonVisibility();
    const { data: agents } = useProjectAiAgents({
        projectUuid,
        redirectOnUnauthorized: false,
        options: { enabled: isAiVisible },
    });

    if (!isAiVisible || !agents || agents.length === 0) {
        return null;
    }

    const isEnabled = form.values.agentUuid !== null;

    return (
        <Stack gap="xs">
            <Group gap="xs">
                <MantineIcon icon={IconSparkles} />
                <Switch
                    label="Write the message with an AI agent"
                    checked={isEnabled}
                    onChange={(event) =>
                        form.setFieldValue(
                            'agentUuid',
                            event.currentTarget.checked ? agents[0].uuid : null,
                        )
                    }
                />
            </Group>

            {isEnabled && (
                <Stack gap="sm" pl="xl">
                    <Select
                        label="Agent"
                        data={agents.map((agent) => ({
                            value: agent.uuid,
                            label: agent.name,
                        }))}
                        value={form.values.agentUuid}
                        onChange={(value) =>
                            form.setFieldValue('agentUuid', value)
                        }
                        allowDeselect={false}
                        comboboxProps={{ withinPortal: true }}
                    />
                    <Textarea
                        label="Instructions"
                        description="What the agent should report on. It runs over this delivery's content on every send."
                        autosize
                        minRows={2}
                        {...form.getInputProps('prompt')}
                    />
                    <Switch
                        label="Build on previous deliveries"
                        description="The agent sees this delivery's recent runs, so it can report on what changed since last time."
                        checked={form.values.includeRunHistory}
                        onChange={(event) =>
                            form.setFieldValue(
                                'includeRunHistory',
                                event.currentTarget.checked,
                            )
                        }
                    />
                    {sourceThreadUuid && (
                        <Switch
                            label="Include the source conversation as context"
                            description="The agent will also see the conversation this delivery was created from."
                            {...form.getInputProps('includeSourceThread', {
                                type: 'checkbox',
                            })}
                        />
                    )}
                </Stack>
            )}
        </Stack>
    );
};
