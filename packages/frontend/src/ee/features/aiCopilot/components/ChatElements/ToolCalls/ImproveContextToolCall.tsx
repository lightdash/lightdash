import { Button, Group, Paper, Stack, Text } from '@mantine-8/core';
import { IconSchool } from '@tabler/icons-react';
import type { FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { useAppendInstructionMutation } from '../../../hooks/useProjectAiAgents';
import { clearImproveContextNotification } from '../../../store/aiAgentThreadStreamSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../../store/hooks';

type ImproveContextToolCallProps = {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    promptUuid: string;
};

export const ImproveContextToolCall: FC<ImproveContextToolCallProps> = ({
    projectUuid,
    agentUuid,
    threadUuid,
    promptUuid,
}) => {
    const improveContextNotification = useAiAgentStoreSelector((state) => {
        const thread = state.aiAgentThreadStream[threadUuid];
        if (thread?.messageUuid === promptUuid) {
            return thread.improveContextNotification;
        }
        return null;
    });
    const dispatch = useAiAgentStoreDispatch();

    const appendInstructionMutation = useAppendInstructionMutation(
        projectUuid,
        agentUuid,
    );

    if (!improveContextNotification) {
        return null;
    }

    const handleSave = async () => {
        if (!improveContextNotification) return;

        await appendInstructionMutation.mutateAsync({
            instruction: improveContextNotification.suggestedInstruction,
        });

        dispatch(
            clearImproveContextNotification({
                threadUuid,
            }),
        );
    };

    const handleDismiss = () => {
        dispatch(
            clearImproveContextNotification({
                threadUuid,
            }),
        );
    };

    return (
        <Paper bg="white" p="xs" mb="xs" withBorder>
            <Group gap="xs" align="flex-start" wrap="nowrap">
                <MantineIcon icon={IconSchool} size="md" color="indigo.6" />
                <Stack gap="xs" style={{ flex: 1 }}>
                    <Text fz="xs" fw={500} c="ldGray.9" lh="normal" m={0}>
                        Save instruction to memory?
                    </Text>

                    <Text
                        fz="xs"
                        c="ldGray.7"
                        bg="ldGray.0"
                        p="xs"
                        style={{
                            borderRadius: '4px',
                            fontStyle: 'italic',
                        }}
                    >
                        {improveContextNotification.suggestedInstruction}
                    </Text>
                    <Group justify="flex-end" gap="xs">
                        <Button
                            size="compact-xs"
                            variant="subtle"
                            color="gray"
                            onClick={handleDismiss}
                            disabled={appendInstructionMutation.isLoading}
                        >
                            Dismiss
                        </Button>
                        <Button
                            size="compact-xs"
                            color="indigo"
                            onClick={handleSave}
                            loading={appendInstructionMutation.isLoading}
                        >
                            Save
                        </Button>
                    </Group>
                </Stack>
            </Group>
        </Paper>
    );
};
