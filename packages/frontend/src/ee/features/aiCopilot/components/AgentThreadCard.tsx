import type { AiAgentThreadSummary } from '@lightdash/common';
import {
    Avatar,
    Group,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import dayjs from 'dayjs';
import type { FC } from 'react';
import { Link } from 'react-router';
import { useTimeAgo } from '../../../../hooks/useTimeAgo';
import slackSvg from '../../../../svgs/slack.svg';

type AgentThreadCardProps = {
    thread: AiAgentThreadSummary;
    isActive: boolean;
};

export const AgentThreadCardEmpty = ({
    isActive,
    children,
    to,
    onClick,
}: {
    isActive?: boolean;
    children: React.ReactNode;
    to?: string;
    onClick?: () => void;
}) => {
    return (
        <UnstyledButton
            component={to ? Link : undefined}
            to={to ?? undefined}
            onClick={onClick}
            sx={(theme) => ({
                borderRadius: theme.radius.md,
                border: `2px solid ${
                    isActive ? theme.colors.blue[6] : 'transparent'
                }`,
                backgroundColor: isActive
                    ? theme.colors.blue[0]
                    : 'transparent',
                padding: `${theme.spacing.xs} ${theme.spacing.xs}`,
                ':hover': isActive
                    ? undefined
                    : {
                          backgroundColor: theme.fn.rgba(
                              theme.colors.gray[2],
                              0.5,
                          ),
                      },
            })}
        >
            {children}
        </UnstyledButton>
    );
};

const AgentThreadCard: FC<AgentThreadCardProps> = ({ thread, isActive }) => {
    const timeAgo = useTimeAgo(new Date(thread.createdAt));

    return (
        <AgentThreadCardEmpty
            to={`/aiAgents/${thread.agentUuid}/threads/${thread.uuid}`}
            isActive={isActive}
        >
            <Group align="flex-start" noWrap>
                <div style={{ position: 'relative' }}>
                    <Avatar
                        radius="xl"
                        variant="filled"
                        // style={{ overflow: 'unset' }}
                        name={thread.user.name}
                        color="initials"
                    />

                    {thread.createdFrom === 'slack' && (
                        <Avatar
                            size="sm"
                            p={4}
                            src={slackSvg}
                            bg="white"
                            radius="xl"
                            pos="absolute"
                            right={-12}
                            bottom={-12}
                        />
                    )}
                </div>

                <Stack spacing="xs" w="100%" style={{ overflow: 'hidden' }}>
                    <Group position="apart">
                        <Text fw={600}>{thread.user.name}</Text>

                        <Tooltip
                            label={dayjs(thread.createdAt).toString()}
                            withinPortal
                        >
                            <Text component="time" color="dimmed" size="sm">
                                {timeAgo}
                            </Text>
                        </Tooltip>
                    </Group>

                    <Text truncate>{thread.firstMessage}</Text>
                </Stack>
            </Group>
        </AgentThreadCardEmpty>
    );
};

export default AgentThreadCard;
