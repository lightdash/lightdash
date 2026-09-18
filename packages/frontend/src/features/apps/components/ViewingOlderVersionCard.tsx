import { Button, Group, Paper, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconHistory } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    viewingVersion: number;
    latestVersion: number;
    restoreDisabled: boolean;
    onRestore: () => void;
    onReturnToLatest: () => void;
};

/** Shown in place of the chat input while the preview is pinned to an
 *  older version. */
export const ViewingOlderVersionCard: FC<Props> = ({
    viewingVersion,
    latestVersion,
    restoreDisabled,
    onRestore,
    onReturnToLatest,
}) => (
    <Paper p="md">
        <Group gap="sm" align="flex-start" wrap="nowrap">
            <ThemeIcon variant="light" color="indigo" radius="xl" size="lg">
                <MantineIcon icon={IconHistory} />
            </ThemeIcon>
            <Stack gap={4}>
                <Text fz="sm" fw={600}>
                    You're viewing version {viewingVersion}
                </Text>
                <Text fz="sm" c="dimmed">
                    New prompts always continue from the latest build. Return to
                    version {latestVersion}, or restore this version as the new
                    latest to keep iterating from here.
                </Text>
                <Group gap="xs" mt="sm">
                    <Button
                        size="xs"
                        disabled={restoreDisabled}
                        onClick={onRestore}
                    >
                        Restore this version
                    </Button>
                    <Button
                        size="xs"
                        variant="subtle"
                        onClick={onReturnToLatest}
                    >
                        Return to latest (v{latestVersion})
                    </Button>
                </Group>
            </Stack>
        </Group>
    </Paper>
);
