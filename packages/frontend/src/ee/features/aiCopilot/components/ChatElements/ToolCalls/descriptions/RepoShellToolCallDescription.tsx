import { rem, Text } from '@mantine-8/core';
import type { FC } from 'react';
import { ToolCallChip } from '../ToolCallChip';

type RepoShellToolCallDescriptionProps = {
    command: string | null;
};

// Pick a human verb from the command's most specific operation, so a piped
// command like `find … | xargs grep -l x` reads as "Searched" rather than
// "Listed". The raw command is always shown alongside for transparency.
const verbForCommand = (command: string): string => {
    const tokens = command
        .toLowerCase()
        .split(/\s+|\|/)
        .filter(Boolean);
    if (tokens.includes('grep')) return 'Searched';
    if (tokens.includes('cat')) return 'Read';
    if (tokens.includes('find')) return 'Found files';
    if (tokens.includes('ls')) return 'Listed';
    if (tokens.includes('wc')) return 'Counted';
    return 'Ran';
};

export const RepoShellToolCallDescription: FC<
    RepoShellToolCallDescriptionProps
> = ({ command }) => {
    if (!command) {
        return (
            <Text c="dimmed" size="xs">
                Read repository
            </Text>
        );
    }
    return (
        <Text c="dimmed" size="xs">
            {verbForCommand(command)}
            <ToolCallChip mx={rem(2)} ff="monospace">
                {command}
            </ToolCallChip>
        </Text>
    );
};
