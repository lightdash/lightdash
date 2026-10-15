import { type ToolFindFieldsArgsTransformed } from '@lightdash/common';
import { rem, Text } from '@mantine/core';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolCallChip } from '../ToolCallChip';

type FieldSearchToolCallDescriptionProps = {
    searchQueries: NonNullable<ToolFindFieldsArgsTransformed>['fieldSearchQueries'];
};

export const FieldSearchToolCallDescription: FC<
    FieldSearchToolCallDescriptionProps
> = ({ searchQueries }) => {
    const { t } = useTranslation('aiCopilotChat');
    return (
        <Text c="dimmed" size="xs">
            {t('toolDescriptions.searchedForFields')}{' '}
            {searchQueries?.map((query) => (
                <ToolCallChip key={query.label} mx={rem(2)}>
                    {query.label}
                </ToolCallChip>
            ))}
        </Text>
    );
};
