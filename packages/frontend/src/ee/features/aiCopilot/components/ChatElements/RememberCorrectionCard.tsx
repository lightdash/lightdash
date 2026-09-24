import {
    FeatureFlags,
    hasTeamVocabularyLine,
    type AiAgentJevCorrection,
} from '@lightdash/common';
import { Button, Group, Paper, Stack, Text } from '@mantine/core';
import { IconBookmark, IconCheck } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useServerFeatureFlag } from '../../../../../hooks/useServerOrClientFeatureFlag';
import { useAiAgentPermission } from '../../hooks/useAiAgentPermission';
import {
    useProjectAiAgent,
    useRememberCorrectionMutation,
} from '../../hooks/useProjectAiAgents';

type Props = {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    messageUuid: string;
    /** The user's own sentence; it is what gets saved. */
    userPrompt: string;
    correction: AiAgentJevCorrection;
};

const dismissedKey = (messageUuid: string) =>
    `ld.aiAgent.rememberDismissed.${messageUuid}`;

const readDismissed = (messageUuid: string) => {
    try {
        return localStorage.getItem(dismissedKey(messageUuid)) === '1';
    } catch {
        return false;
    }
};

/** Offers agent admins to keep a definition the user stated, so future threads apply it. */
export const RememberCorrectionCard: FC<Props> = ({
    projectUuid,
    agentUuid,
    threadUuid,
    messageUuid,
    userPrompt,
    correction,
}) => {
    const { data: fastDecisions } = useServerFeatureFlag(
        FeatureFlags.AiAgentFastDecisions,
    );
    const canManageAgent = useAiAgentPermission({
        action: 'manage',
        projectUuid,
    });
    const { data: agent } = useProjectAiAgent(projectUuid, agentUuid);
    const { mutate, isLoading } = useRememberCorrectionMutation(
        projectUuid,
        agentUuid,
        threadUuid,
    );
    const [dismissed, setDismissed] = useState(() =>
        readDismissed(messageUuid),
    );

    const saved = hasTeamVocabularyLine(agent?.instruction ?? null, userPrompt);
    if (
        !fastDecisions?.enabled ||
        !canManageAgent ||
        !agent ||
        correction.coveredBy !== null ||
        (dismissed && !saved)
    )
        return null;

    const dismiss = () => {
        setDismissed(true);
        try {
            localStorage.setItem(dismissedKey(messageUuid), '1');
        } catch {
            // Dismissal is a per-viewer convenience; losing it only shows the card again.
        }
    };

    if (saved)
        return (
            <Group gap="xs" wrap="nowrap">
                <MantineIcon icon={IconCheck} color="teal" />
                <Text fz="sm" c="dimmed">
                    Saved to this agent's team vocabulary.
                </Text>
                <Button
                    size="compact-xs"
                    variant="subtle"
                    loading={isLoading}
                    onClick={() => mutate({ messageUuid, remember: false })}
                >
                    Undo
                </Button>
            </Group>
        );

    return (
        <Paper p="sm">
            <Stack gap="xs">
                <Group gap="xs" wrap="nowrap">
                    <MantineIcon icon={IconBookmark} color="indigo" />
                    <Text fz="sm" fw={500}>
                        Remember this for next time?
                    </Text>
                </Group>
                <Text fz="sm" c="dimmed">
                    “{userPrompt}”
                </Text>
                <Text fz="xs" c="dimmed">
                    Saving adds it to this agent's instructions, so every thread
                    with this agent uses it.
                </Text>
                <Group gap="xs">
                    <Button
                        size="xs"
                        loading={isLoading}
                        onClick={() => mutate({ messageUuid, remember: true })}
                    >
                        Save for everyone using this agent
                    </Button>
                    <Button size="xs" variant="subtle" onClick={dismiss}>
                        Not now
                    </Button>
                </Group>
            </Stack>
        </Paper>
    );
};
