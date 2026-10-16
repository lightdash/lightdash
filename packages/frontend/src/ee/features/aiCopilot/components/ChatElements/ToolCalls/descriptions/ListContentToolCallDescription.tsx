import { rem, Text } from '@mantine/core';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolCallChip } from '../ToolCallChip';

type ListContentToolCallDescriptionProps = {
    page?: number | null;
    spaceSlug?: string | null;
};

export const ListContentToolCallDescription: FC<
    ListContentToolCallDescriptionProps
> = ({ page, spaceSlug }) => {
    const { t } = useTranslation('aiCopilotChat');
    return (
        <Text c="dimmed" size="xs">
            {spaceSlug
                ? t('toolDescriptions.listedSpaceContent')
                : t('toolDescriptions.listedRootContent')}{' '}
            {spaceSlug ? (
                <ToolCallChip mx={rem(2)}>{spaceSlug}</ToolCallChip>
            ) : null}
            {page && page > 1 ? (
                <ToolCallChip mx={rem(2)}>
                    {t('toolDescriptions.page', { page })}
                </ToolCallChip>
            ) : null}
        </Text>
    );
};
