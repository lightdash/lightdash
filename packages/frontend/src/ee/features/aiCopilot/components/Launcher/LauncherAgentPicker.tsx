import { Badge, Box, Button, Paper, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import styles from './AiAgentsLauncher.module.css';
import { type LauncherRouterCandidate } from './useAiAgentLauncherRouter';

export const LauncherAgentPicker: FC<{
    candidates: LauncherRouterCandidate[];
    onPick: (agentUuid: string) => void;
    waitingPrompt: string | null;
}> = ({ candidates, onPick, waitingPrompt }) => (
    <Stack gap="xs" px="md" pb="xs">
        {waitingPrompt && (
            <Stack gap="xxs">
                <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                    Your message
                </Text>
                <Paper p="xs" className={styles.waitingPrompt}>
                    <Text size="sm" lineClamp={4}>
                        {waitingPrompt}
                    </Text>
                </Paper>
            </Stack>
        )}
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
            {waitingPrompt ? 'Choose an agent to send it to' : 'Choose agent'}
        </Text>
        <Stack gap="xxs">
            {candidates.map((candidate) => (
                <Button
                    key={candidate.agentUuid}
                    variant="default"
                    justify="start"
                    leftSection={
                        <LightdashUserAvatar
                            size="xs"
                            name={candidate.name}
                            src={candidate.agent?.imageUrl}
                        />
                    }
                    onClick={() => onPick(candidate.agentUuid)}
                >
                    <Box className={styles.candidateContent}>
                        <Box className={styles.candidateText}>
                            {candidate.name}
                        </Box>
                        {candidate.isRecommended && (
                            <Badge size="xs" color="violet">
                                Recommended
                            </Badge>
                        )}
                    </Box>
                </Button>
            ))}
        </Stack>
    </Stack>
);
