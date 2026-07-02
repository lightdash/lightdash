import {
    SchedulerAiAugmentationType,
    type SchedulerAiAugmentation,
} from '@lightdash/common';
import {
    Group,
    SegmentedControl,
    Select,
    Stack,
    Switch,
    Text,
    Textarea,
} from '@mantine-8/core';
import { IconSparkles } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useAiAgentButtonVisibility } from '../../../../ee/features/aiCopilot/hooks/useAiAgentsButtonVisibility';
import { useProjectAiAgents } from '../../../../ee/features/aiCopilot/hooks/useProjectAiAgents';
import { useSchedulerFormContext } from './schedulerFormContext';

const DEFAULT_PROMPT =
    'Summarise this delivery and call out any notable changes or trends.';

type Props = {
    projectUuid: string | undefined;
};

// Renders nothing unless AI is available for this project.
export const SchedulerFormAiInput: FC<Props> = ({ projectUuid }) => {
    const form = useSchedulerFormContext();
    const isAiVisible = useAiAgentButtonVisibility();
    const { data: agents } = useProjectAiAgents({
        projectUuid,
        redirectOnUnauthorized: false,
        options: { enabled: isAiVisible },
    });

    if (!isAiVisible) {
        return null;
    }

    const augmentation = form.values.aiAugmentation;
    const isEnabled = augmentation !== null;
    const hasAgents = !!agents && agents.length > 0;

    const setAugmentation = (value: SchedulerAiAugmentation | null) =>
        form.setFieldValue('aiAugmentation', value);

    const enable = (enabled: boolean) => {
        if (!enabled) {
            setAugmentation(null);
            return;
        }
        setAugmentation(
            hasAgents
                ? {
                      type: SchedulerAiAugmentationType.AGENT,
                      prompt: DEFAULT_PROMPT,
                      agentUuid: agents[0].uuid,
                      sourceThreadUuid: null,
                  }
                : {
                      type: SchedulerAiAugmentationType.FAST_MODEL,
                      prompt: DEFAULT_PROMPT,
                  },
        );
    };

    const setMode = (mode: SchedulerAiAugmentationType) => {
        if (!augmentation) return;
        if (mode === SchedulerAiAugmentationType.AGENT && hasAgents) {
            setAugmentation({
                type: SchedulerAiAugmentationType.AGENT,
                prompt: augmentation.prompt,
                agentUuid: agents[0].uuid,
                sourceThreadUuid: null,
            });
        } else {
            setAugmentation({
                type: SchedulerAiAugmentationType.FAST_MODEL,
                prompt: augmentation.prompt,
            });
        }
    };

    const setPrompt = (prompt: string) => {
        if (!augmentation) return;
        setAugmentation({ ...augmentation, prompt });
    };

    return (
        <Stack gap="xs">
            <Group gap="xs">
                <MantineIcon icon={IconSparkles} />
                <Switch
                    label="Write the message with AI"
                    checked={isEnabled}
                    onChange={(event) => enable(event.currentTarget.checked)}
                />
            </Group>

            {augmentation && (
                <Stack gap="sm" pl="xl">
                    {hasAgents && (
                        <SegmentedControl
                            value={augmentation.type}
                            onChange={(value) =>
                                setMode(value as SchedulerAiAugmentationType)
                            }
                            data={[
                                {
                                    label: 'AI agent',
                                    value: SchedulerAiAugmentationType.AGENT,
                                },
                                {
                                    label: 'Fast model',
                                    value: SchedulerAiAugmentationType.FAST_MODEL,
                                },
                            ]}
                        />
                    )}

                    {augmentation.type ===
                        SchedulerAiAugmentationType.AGENT && (
                        <Select
                            label="Agent"
                            data={(agents ?? []).map((agent) => ({
                                value: agent.uuid,
                                label: agent.name,
                            }))}
                            value={augmentation.agentUuid}
                            onChange={(value) => {
                                if (value) {
                                    setAugmentation({
                                        ...augmentation,
                                        agentUuid: value,
                                    });
                                }
                            }}
                            allowDeselect={false}
                            comboboxProps={{ withinPortal: true }}
                        />
                    )}

                    <Textarea
                        label="Instructions"
                        description="What the AI should report on. It runs over this delivery's content on every send."
                        autosize
                        minRows={2}
                        value={augmentation.prompt}
                        onChange={(event) =>
                            setPrompt(event.currentTarget.value)
                        }
                        error={
                            augmentation.prompt.trim().length === 0
                                ? 'Instructions are required'
                                : undefined
                        }
                    />

                    {augmentation.type ===
                        SchedulerAiAugmentationType.FAST_MODEL && (
                        <Text size="xs" c="ldGray.6">
                            A fast model summarises the delivery's data. It does
                            not use an agent's tools or context.
                        </Text>
                    )}
                </Stack>
            )}
        </Stack>
    );
};
