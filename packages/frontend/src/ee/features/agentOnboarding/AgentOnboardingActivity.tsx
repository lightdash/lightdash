import { type AgentOnboardingRunEvent } from '@lightdash/common';
import { Box, Button, Group, ScrollArea, Stack, Text } from '@mantine/core';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import {
    useEffect,
    useId,
    useRef,
    useState,
    type FC,
    type UIEvent,
} from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import classes from './AgentOnboardingRunPage.module.css';
import { sanitizeTerminalText } from './utils';

const BOTTOM_THRESHOLD_PX = 32;

const getActivityLinePrefix = (message: string): string => {
    const normalizedMessage = message.trimStart();
    if (/^lightdash(?:\s|$)/i.test(normalizedMessage)) return 'lightdash';
    return (
        normalizedMessage.match(/^([a-z][\w-]*):/i)?.[1].toLowerCase() ??
        'command'
    );
};

const formatEventTime = (createdAt: string): string =>
    new Date(createdAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });

const AgentOnboardingActivity: FC<{
    events: AgentOnboardingRunEvent[];
    id: string;
}> = ({ events, id }) => {
    const viewportRef = useRef<HTMLDivElement>(null);
    const shouldFollowRef = useRef(true);

    useEffect(() => {
        if (!shouldFollowRef.current) return;
        const frame = window.requestAnimationFrame(() => {
            if (!viewportRef.current) return;
            viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
        });
        return () => window.cancelAnimationFrame(frame);
    }, [events]);

    const handleScroll = (event: UIEvent<HTMLDivElement>) => {
        const element = event.currentTarget;
        shouldFollowRef.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <=
            BOTTOM_THRESHOLD_PX;
    };

    return (
        <ScrollArea
            id={id}
            viewportRef={viewportRef}
            className={classes.terminal}
            viewportProps={{ onScroll: handleScroll }}
        >
            <Stack gap={4} p="md">
                {events.length === 0 ? (
                    <Text c="dimmed" fz="xs" ff="monospace">
                        Waiting for the agent to start…
                    </Text>
                ) : (
                    events.map((event, index) => (
                        <Group
                            key={`${event.createdAt}-${index}`}
                            gap="sm"
                            align="flex-start"
                            wrap="nowrap"
                            className={classes.terminalEntry}
                        >
                            <Text
                                c="dimmed"
                                fz="xs"
                                ff="monospace"
                                className={classes.terminalTime}
                            >
                                {formatEventTime(event.createdAt)}
                            </Text>
                            <Box
                                component="span"
                                fz="xs"
                                ff="monospace"
                                className={classes.terminalMessage}
                                data-line-prefix={getActivityLinePrefix(
                                    event.message,
                                )}
                            >
                                {sanitizeTerminalText(event.message)}
                            </Box>
                        </Group>
                    ))
                )}
            </Stack>
        </ScrollArea>
    );
};

export const AgentOnboardingActivityPanel: FC<{
    events: AgentOnboardingRunEvent[];
}> = ({ events }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const activityId = useId();
    const lastEvent = events.at(-1);

    return (
        <Box className={classes.activity} data-collapsed={isCollapsed}>
            <Box className={classes.activityHeader}>
                <Group gap="xs" wrap="nowrap" miw={0}>
                    <Text fz="sm" fw={500}>
                        Activity
                    </Text>
                    {isCollapsed && lastEvent ? (
                        <Text c="dimmed" fz="xs" ff="monospace" truncate>
                            {sanitizeTerminalText(lastEvent.message)}
                        </Text>
                    ) : (
                        <Text c="dimmed" fz="xs">
                            {events.length}
                        </Text>
                    )}
                </Group>
                <Button
                    variant="subtle"
                    size="compact-xs"
                    rightSection={
                        <MantineIcon
                            icon={isCollapsed ? IconChevronUp : IconChevronDown}
                            size={14}
                        />
                    }
                    aria-expanded={!isCollapsed}
                    aria-controls={activityId}
                    onClick={() => setIsCollapsed((value) => !value)}
                >
                    {isCollapsed ? 'Show' : 'Hide'}
                </Button>
            </Box>
            <AgentOnboardingActivity id={activityId} events={events} />
        </Box>
    );
};
