import { type AgentOnboardingRunEvent } from '@lightdash/common';
import { Box, Button, Group, ScrollArea, Stack, Text } from '@mantine-8/core';
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

const AgentOnboardingActivity: FC<{
    events: AgentOnboardingRunEvent[];
    isCollapsed?: boolean;
    id?: string;
}> = ({ events, isCollapsed = false, id }) => {
    const viewportRef = useRef<HTMLDivElement>(null);
    const shouldFollowRef = useRef(true);
    const visibleEvents = isCollapsed ? events.slice(-1) : events;

    useEffect(() => {
        if (!shouldFollowRef.current || !viewportRef.current) return;
        viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }, [events, isCollapsed]);

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
            onScrollPositionChange={() => undefined}
            className={classes.terminal}
            data-collapsed={isCollapsed || undefined}
            viewportProps={{ onScroll: handleScroll }}
        >
            <Stack
                gap={isCollapsed ? 0 : 8}
                px="md"
                pt={isCollapsed ? 10 : 44}
                pb={isCollapsed ? 10 : 'md'}
                pr={isCollapsed ? 170 : 'md'}
            >
                {visibleEvents.length === 0 ? (
                    <Text
                        c="gray.5"
                        fz="sm"
                        ff="monospace"
                        className={classes.terminalMessage}
                    >
                        Waiting for the onboarding agent to start…
                    </Text>
                ) : (
                    visibleEvents.map((event, index) => (
                        <Group
                            key={`${event.createdAt}-${index}`}
                            gap="sm"
                            align="flex-start"
                            wrap="nowrap"
                            className={classes.terminalEntry}
                        >
                            <Text
                                c="gray.6"
                                fz="xs"
                                ff="monospace"
                                className={classes.terminalTime}
                            >
                                {new Date(event.createdAt).toLocaleTimeString(
                                    [],
                                    {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit',
                                    },
                                )}
                            </Text>
                            <Box
                                component="span"
                                fz="sm"
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
    hasGeneratedFiles: boolean;
}> = ({ events, hasGeneratedFiles }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const activityId = useId();

    useEffect(() => {
        if (hasGeneratedFiles) setIsCollapsed(true);
    }, [hasGeneratedFiles]);

    return (
        <Box className={classes.activityPanel}>
            <Button
                variant="subtle"
                color="gray"
                size="compact-sm"
                leftSection={
                    <MantineIcon
                        icon={isCollapsed ? IconChevronDown : IconChevronUp}
                        size={14}
                    />
                }
                aria-expanded={!isCollapsed}
                aria-controls={activityId}
                onClick={() => setIsCollapsed((value) => !value)}
                className={classes.activityToggle}
            >
                {isCollapsed
                    ? 'Expand live activity'
                    : 'Collapse live activity'}
            </Button>
            <AgentOnboardingActivity
                id={activityId}
                events={events}
                isCollapsed={isCollapsed}
            />
        </Box>
    );
};
