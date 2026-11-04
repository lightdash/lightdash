import { Box, Stack, Text } from '@mantine/core';
import { type FC, type PropsWithChildren, type ReactNode } from 'react';
import useApp from '../../../../providers/App/useApp';
import { getGreeting } from '../greeting';
import layout from '../homepageLayout.module.css';

/** The greeting opening, shared by day-0, the greeting block, and the AI
 * hero's no-AI degrade so all three read identically. Children render under
 * the greeting (e.g. quick actions). */
export const GreetingHero: FC<
    PropsWithChildren<{
        subtitle: string;
        /** Replaces the subtitle text, e.g. with its inline editor. */
        subtitleSlot?: ReactNode;
    }>
> = ({ subtitle, subtitleSlot, children }) => {
    const { user } = useApp();
    return (
        <Stack gap={16} align="center">
            <Box ta="center">
                <Text component="h1" className={layout.heroGreeting}>
                    {getGreeting(user.data?.firstName)}
                </Text>
                {subtitleSlot ??
                    (subtitle.trim() ? (
                        <Text className={layout.heroGreetingSub}>
                            {subtitle}
                        </Text>
                    ) : null)}
            </Box>
            {children}
        </Stack>
    );
};
