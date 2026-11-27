import { type AiPromptContextItem } from '@lightdash/common';
import { Badge, Box, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import { ThreadImageReference } from '../ChatElements/ThreadImageReference';
import styles from './AiAgentsLauncher.module.css';
import { type LauncherRouterCandidate } from './useAiAgentLauncherRouter';

export const LauncherAgentPicker: FC<{
    candidates: LauncherRouterCandidate[];
    onPick: (agentUuid: string) => void;
    /** Images held with the waiting message; shown only with it. */
    waitingImages: Extract<AiPromptContextItem, { type: 'thread_image' }>[];
    waitingPrompt: string | null;
}> = ({ candidates, onPick, waitingImages, waitingPrompt }) => (
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
                    {waitingImages.length > 0 && (
                        <Group gap="xs" wrap="wrap" mt="xs">
                            {waitingImages.map((image) => (
                                <ThreadImageReference
                                    key={image.fileUuid}
                                    item={image}
                                />
                            ))}
                        </Group>
                    )}
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
