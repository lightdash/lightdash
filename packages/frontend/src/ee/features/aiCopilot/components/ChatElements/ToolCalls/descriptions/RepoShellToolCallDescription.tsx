import { rem, Text } from '@mantine/core';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolCallChip } from '../ToolCallChip';

type RepoShellToolCallDescriptionProps = {
    command: string | null;
};

// Pick a human verb from the command's most specific operation, so a piped
// command like `find … | xargs grep -l x` reads as "Searched" rather than
// "Listed". The raw command is always shown alongside for transparency.
const verbKeyForCommand = (command: string): string => {
    const tokens = command
        .toLowerCase()
        .split(/\s+|\|/)
        .filter(Boolean);
    if (tokens.includes('grep')) return 'toolDescriptions.repoShell.searched';
    if (tokens.includes('cat')) return 'toolDescriptions.repoShell.read';
    if (tokens.includes('find')) return 'toolDescriptions.repoShell.foundFiles';
    if (tokens.includes('ls')) return 'toolDescriptions.repoShell.listed';
    if (tokens.includes('wc')) return 'toolDescriptions.repoShell.counted';
    return 'toolDescriptions.repoShell.ran';
};

export const RepoShellToolCallDescription: FC<
    RepoShellToolCallDescriptionProps
> = ({ command }) => {
    const { t } = useTranslation('aiCopilotChat');
    if (!command) {
        return (
            <Text c="dimmed" size="xs">
                {t('toolDescriptions.repoShell.readRepository')}
            </Text>
        );
    }
    return (
        <Text c="dimmed" size="xs">
            {t(verbKeyForCommand(command))}
            <ToolCallChip mx={rem(2)} ff="monospace">
                {command}
            </ToolCallChip>
        </Text>
    );
};
