import { type ToolFindContentArgsTransformed } from '@lightdash/common';
import { rem, Text } from '@mantine/core';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolCallChip } from '../ToolCallChip';

type ContentSearchToolCallDescriptionProps = {
    searchType: 'content' | 'dashboards' | 'charts';
    searchQueries: NonNullable<ToolFindContentArgsTransformed>['searchQueries'];
};

export const ContentSearchToolCallDescription: FC<
    ContentSearchToolCallDescriptionProps
> = ({ searchType, searchQueries }) => {
    const { t } = useTranslation('aiCopilotChat');
    const typeText = {
        content: t('toolDescriptions.searchTypes.content'),
        dashboards: t('toolDescriptions.searchTypes.dashboards'),
        charts: t('toolDescriptions.searchTypes.charts'),
    }[searchType];

    return (
        <Text c="dimmed" size="xs">
            {t('toolDescriptions.searchedFor', { type: typeText })}{' '}
            {searchQueries.map((query) => (
                <ToolCallChip key={query.label} mx={rem(2)}>
                    {query.label}
                </ToolCallChip>
            ))}
        </Text>
    );
};
