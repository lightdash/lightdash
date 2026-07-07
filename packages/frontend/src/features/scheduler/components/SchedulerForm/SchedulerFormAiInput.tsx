import { type SchedulerAiAugmentation } from '@lightdash/common';
import {
    Box,
    Group,
    Select,
    Stack,
    Switch,
    Text,
    Textarea,
} from '@mantine-8/core';
import { type FC } from 'react';
import { AiAgentIcon } from '../../../../ee/features/aiCopilot/components/AiAgentIcon';
import { useAiAgentButtonVisibility } from '../../../../ee/features/aiCopilot/hooks/useAiAgentsButtonVisibility';
import { useProjectAiAgents } from '../../../../ee/features/aiCopilot/hooks/useProjectAiAgents';
import { DEFAULT_AI_AUGMENTATION_PROMPT } from '../types';
import classes from './SchedulerFormAiInput.module.css';
import { useSchedulerFormContext } from './schedulerFormContext';

type Props = {
    projectUuid: string | undefined;
    /** Skip the panel chrome and leading icon when the host surface already provides them */
    bare?: boolean;
};

// Renders nothing unless AI is available for this project. Turning it on makes
// the delivery message AI-written; picking an agent is an optional upgrade.
export const SchedulerFormAiInput: FC<Props> = ({ projectUuid, bare }) => {
    const form = useSchedulerFormContext();
    const isAiVisible = useAiAgentButtonVisibility();
    const { data: agentsData } = useProjectAiAgents({
        projectUuid,
        redirectOnUnauthorized: false,
        options: { enabled: isAiVisible },
    });

    if (!isAiVisible) {
        return null;
    }

    const agents = agentsData ?? [];
    const augmentation = form.values.aiAugmentation;
    const isEnabled = augmentation !== null;
    const selectedAgentUuid =
        augmentation?.type === 'agent' ? augmentation.agentUuid : null;

    const set = (value: SchedulerAiAugmentation | null) =>
        form.setFieldValue('aiAugmentation', value);

    const toggle = (on: boolean) =>
        set(
            on
                ? {
                      type: 'fast_model',
                      prompt: DEFAULT_AI_AUGMENTATION_PROMPT,
                  }
                : null,
        );

    const chooseAgent = (agentUuid: string | null) => {
        if (!augmentation) return;
        set(
            agentUuid
                ? {
                      type: 'agent',
                      prompt: augmentation.prompt,
                      agentUuid,
                      sourceThreadUuid:
                          augmentation.type === 'agent'
                              ? augmentation.sourceThreadUuid
                              : null,
                  }
                : {
                      type: 'fast_model',
                      prompt: augmentation.prompt,
                  },
        );
    };

    const setPrompt = (prompt: string) => {
        if (augmentation) set({ ...augmentation, prompt });
    };

    return (
        <Box className={bare ? undefined : classes.panel}>
            <Group justify="space-between" wrap="nowrap" align="center">
                <Group gap="sm" wrap="nowrap" align="center">
                    {!bare && <AiAgentIcon size={18} animated calm />}
                    <Text fw={600} fz="sm">
                        AI-enhanced message
                    </Text>
                </Group>
                <Switch
                    checked={isEnabled}
                    onChange={(event) => toggle(event.currentTarget.checked)}
                />
            </Group>
            <Text
                fz="xs"
                c="ldGray.6"
                mt={2}
                className={bare ? undefined : classes.subtitle}
            >
                Writes the delivery message from your data on every send.
            </Text>

            {augmentation && (
                <Stack gap="sm" mt="md">
                    <Textarea
                        label="Instructions"
                        rows={3}
                        resize="vertical"
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
                    {agents.length > 0 && (
                        <Select
                            label="AI agent (optional)"
                            description="Uses the agent's tools and context."
                            placeholder="None"
                            clearable
                            data={agents.map((agent) => ({
                                value: agent.uuid,
                                label: agent.name,
                            }))}
                            value={selectedAgentUuid}
                            onChange={chooseAgent}
                            comboboxProps={{ withinPortal: true }}
                        />
                    )}
                </Stack>
            )}
        </Box>
    );
};
