import { rem, Text } from '@mantine/core';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolCallChip } from '../ToolCallChip';

type ExploreToolCallDescriptionProps = {
    exploreName: string | null;
    searchQuery: string | null;
};

export const ExploreToolCallDescription: FC<
    ExploreToolCallDescriptionProps
> = ({ exploreName, searchQuery }) => {
    const { t } = useTranslation('aiCopilotChat');
    return (
        <Text c="dimmed" size="xs">
            {t('toolDescriptions.searchedExplores')}{' '}
            {searchQuery ? (
                <Text span>
                    <Text c="dimmed" size="xs" span>
                        {t('toolDescriptions.matchingQuery')}
                    </Text>
                    <ToolCallChip mx={rem(2)}>"{searchQuery}"</ToolCallChip>
                </Text>
            ) : exploreName ? (
                <ToolCallChip mx={rem(2)}>{exploreName}</ToolCallChip>
            ) : null}
        </Text>
    );
};
