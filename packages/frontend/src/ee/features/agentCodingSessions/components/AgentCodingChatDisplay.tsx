import type { AgentCodingSessionMessage } from '@lightdash/common';
import { ScrollArea, Stack } from '@mantine-8/core';
import { useEffect, useRef, type FC, type ReactNode } from 'react';
import type { StreamSegment } from '../hooks/useAgentCodingStream';
import {
    AgentCodingAssistantBubble,
    AgentCodingUserBubble,
} from './AgentCodingChatBubbles';
import classes from './AgentCodingChatDisplay.module.css';

interface AgentCodingChatDisplayProps {
    messages: AgentCodingSessionMessage[];
    streamSegments?: StreamSegment[];
    isStreaming?: boolean;
    children?: ReactNode; // Input component
}

export const AgentCodingChatDisplay: FC<AgentCodingChatDisplayProps> = ({
    messages,
    streamSegments = [],
    isStreaming = false,
    children,
}) => {
    const viewportRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when content changes or on initial load
    useEffect(() => {
        // Use requestAnimationFrame to ensure DOM has updated
        requestAnimationFrame(() => {
            if (viewportRef.current) {
                viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
            }
        });
    }, [messages, streamSegments, isStreaming]);

    return (
        <Stack flex={1} gap={0} className={classes.container}>
            <ScrollArea flex={1} viewportRef={viewportRef} offsetScrollbars>
                <Stack gap="md" p="md" pb={60}>
                    {messages.map((msg) =>
                        msg.role === 'user' ? (
                            <AgentCodingUserBubble
                                key={msg.messageUuid}
                                message={msg}
                            />
                        ) : (
                            <AgentCodingAssistantBubble
                                key={msg.messageUuid}
                                message={msg}
                            />
                        ),
                    )}
                    {isStreaming && (
                        <AgentCodingAssistantBubble
                            streamSegments={streamSegments}
                            isStreaming
                        />
                    )}
                </Stack>
            </ScrollArea>
            {children}
        </Stack>
    );
};
