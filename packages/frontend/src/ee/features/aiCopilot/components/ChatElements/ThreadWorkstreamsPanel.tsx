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
} from '@mantine/core';
import { IconChevronRight, IconGitPullRequest } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../../../components/common/MantineIcon';
import styles from './ThreadWorkstreamsPanel.module.css';

type WorkstreamState = AiAgentThreadWorkstream['state'];

const STATE_BADGE: Record<
    Exclude<WorkstreamState, null>,
    // labelKey: key in the aiCopilotChat namespace
    { labelKey: string; color: string }
> = {
    open: { labelKey: 'workstreams.state.open', color: 'green' },
    merged: { labelKey: 'workstreams.state.merged', color: 'violet' },
    closed: { labelKey: 'workstreams.state.closed', color: 'red' },
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
    const { t } = useTranslation('aiCopilotChat');
    const [expanded, setExpanded] = useState(false);

    if (workstreams.length === 0) {
        return null;
    }

    return (
        <Box className={styles.container}>
            <Paper radius="md" p={0} mb="sm" bg="ldGray.0">
                <UnstyledButton
                    w="100%"
                    px="sm"
                    py="xs"
                    onClick={() => setExpanded((e) => !e)}
                >
                    <Group gap="xs" wrap="nowrap">
                        <MantineIcon icon={IconGitPullRequest} color="dimmed" />
                        <Text size="sm" fw={500} c="ldGray.7">
                            {t('workstreams.title')}
                        </Text>
                        <Badge size="sm" color="ldGray">
                            {workstreams.length}
                        </Badge>
                        <Box className={styles.spacer} />
                        <MantineIcon
                            icon={IconChevronRight}
                            color="dimmed"
                            className={
                                expanded
                                    ? styles.chevronExpanded
                                    : styles.chevron
                            }
                        />
                    </Group>
                </UnstyledButton>

                <Collapse expanded={expanded}>
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
                                            color={badge.color}
                                            className={styles.noShrink}
                                        >
                                            {t(badge.labelKey)}
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
