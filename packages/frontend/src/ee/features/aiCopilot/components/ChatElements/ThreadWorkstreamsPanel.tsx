import { type AiAgentThreadWorkstream } from '@lightdash/common';
import {
    Anchor,
    Badge,
    Box,
    Collapse,
    Group,
    Paper,
    ScrollArea,
    Text,
    UnstyledButton,
} from '@mantine-8/core';
import { IconChevronRight, IconGitPullRequest } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import styles from './ThreadWorkstreamsPanel.module.css';

type WorkstreamState = AiAgentThreadWorkstream['state'];

const STATE_BADGE: Record<
    Exclude<WorkstreamState, null>,
    { label: string; color: string }
> = {
    open: { label: 'Open', color: 'green' },
    merged: { label: 'Merged', color: 'violet' },
    closed: { label: 'Closed', color: 'red' },
};

type Props = {
    workstreams: AiAgentThreadWorkstream[];
};

/**
 * A compact, collapsible strip listing the pull requests this conversation has
 * opened with the coding agent — so they're first-class and addressable, not
 * just scrolled-away inline cards. Each row links out to the PR and shows its
 * current state; to steer a follow-up at a specific PR, ask the agent in chat.
 */
export const ThreadWorkstreamsPanel: FC<Props> = ({ workstreams }) => {
    const [expanded, setExpanded] = useState(false);

    if (workstreams.length === 0) {
        return null;
    }

    return (
        <Box className={styles.container}>
            <Paper withBorder radius="md" p={0} mb="sm" bg="ldGray.0">
                <UnstyledButton
                    w="100%"
                    px="sm"
                    py="xs"
                    onClick={() => setExpanded((e) => !e)}
                >
                    <Group gap="xs" wrap="nowrap">
                        <MantineIcon
                            icon={IconGitPullRequest}
                            color="ldGray.6"
                        />
                        <Text size="sm" fw={500} c="ldGray.7">
                            Pull requests in this conversation
                        </Text>
                        <Badge size="sm" variant="light" color="ldGray">
                            {workstreams.length}
                        </Badge>
                        <Box className={styles.spacer} />
                        <MantineIcon
                            icon={IconChevronRight}
                            color="ldGray.6"
                            className={
                                expanded
                                    ? styles.chevronExpanded
                                    : styles.chevron
                            }
                        />
                    </Group>
                </UnstyledButton>

                <Collapse in={expanded}>
                    <ScrollArea.Autosize mah={200} px="xs" pb="xs">
                        {workstreams.map((ws) => {
                            const badge = ws.state
                                ? STATE_BADGE[ws.state]
                                : null;
                            return (
                                <Group
                                    key={ws.prUrl}
                                    className={styles.row}
                                    gap="sm"
                                    wrap="nowrap"
                                    px="md"
                                    py="xs"
                                >
                                    <Anchor
                                        href={ws.prUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        size="sm"
                                        fw={500}
                                        className={styles.noShrink}
                                    >
                                        {ws.repository} #{ws.prNumber}
                                    </Anchor>
                                    {badge ? (
                                        <Badge
                                            size="sm"
                                            variant="light"
                                            color={badge.color}
                                            className={styles.noShrink}
                                        >
                                            {badge.label}
                                        </Badge>
                                    ) : null}
                                    <Text
                                        size="sm"
                                        c="dimmed"
                                        truncate
                                        className={styles.title}
                                    >
                                        {ws.title ?? ws.summary ?? ''}
                                    </Text>
                                </Group>
                            );
                        })}
                    </ScrollArea.Autosize>
                </Collapse>
            </Paper>
        </Box>
    );
};
