import { Group, Loader, Paper, Stack, Text, ThemeIcon } from '@mantine/core';
import {
    IconAlertTriangle,
    IconCheck,
    IconCircleDashed,
    IconGitPullRequest,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import {
    useElapsed,
    useWritebackProgress,
} from '../../../hooks/useWritebackProgress';
import styles from './AiEditDbtProjectToolCall.module.css';
import { WRITEBACK_STEPS } from './writebackProgress';

/** A dbt change still running in the background: which step it is on, how long it has been, and what to expect. */
export const WritebackProgressCard: FC<{
    projectUuid: string;
    aiWritebackRunUuid: string;
    startedAt: string | null;
}> = ({ projectUuid, aiWritebackRunUuid, startedAt }) => {
    const { step: current, state } = useWritebackProgress(
        projectUuid,
        aiWritebackRunUuid,
    );
    const elapsed = useElapsed(startedAt);
    return (
        <Paper p="sm" radius="md" className={styles.card}>
            <Group gap="xs" align="flex-start" wrap="nowrap">
                <ThemeIcon variant="light" color="ldGray" radius="md" size="sm">
                    <MantineIcon icon={IconGitPullRequest} size={14} />
                </ThemeIcon>
                <Stack gap={6} flex={1} miw={0}>
                    <Group gap="xs" justify="space-between" wrap="nowrap">
                        <Text size="xs" fw={500}>
                            {state === 'stopped'
                                ? 'The change stopped'
                                : state === 'done'
                                  ? 'Change saved'
                                  : 'Working on the change'}
                        </Text>
                        {elapsed ? (
                            <Text size="xs" c="dimmed" ff="monospace">
                                {elapsed}
                            </Text>
                        ) : null}
                    </Group>
                    <Stack gap={2} role="list" aria-label="Progress">
                        {WRITEBACK_STEPS.map((label, index) => (
                            <Group
                                key={label}
                                gap={6}
                                wrap="nowrap"
                                role="listitem"
                                aria-current={
                                    index === current ? 'step' : undefined
                                }
                                aria-label={`${label}: ${
                                    index < current
                                        ? 'done'
                                        : index > current
                                          ? 'not started'
                                          : state === 'stopped'
                                            ? 'stopped'
                                            : 'in progress'
                                }`}
                            >
                                {index < current ? (
                                    <MantineIcon
                                        icon={IconCheck}
                                        size={12}
                                        color="green"
                                    />
                                ) : index === current && state === 'stopped' ? (
                                    <MantineIcon
                                        icon={IconAlertTriangle}
                                        size={12}
                                        color="red"
                                    />
                                ) : index === current ? (
                                    <Loader size={12} color="gray" />
                                ) : (
                                    <MantineIcon
                                        icon={IconCircleDashed}
                                        size={12}
                                        color="dimmed"
                                    />
                                )}
                                <Text
                                    size="xs"
                                    c={index === current ? undefined : 'dimmed'}
                                >
                                    {label}
                                </Text>
                            </Group>
                        ))}
                    </Stack>
                    <Text size="xs" c="dimmed">
                        Usually takes 2 to 3 minutes. You can leave this page,
                        and the pull request shows up here when it is ready.
                    </Text>
                </Stack>
            </Group>
        </Paper>
    );
};
