import { type ToolSearchSemanticLayerArgs } from '@lightdash/common';
import { rem, Text } from '@mantine/core';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolCallChip } from '../ToolCallChip';

type Props = Pick<ToolSearchSemanticLayerArgs, 'page' | 'searchQuery' | 'type'>;

const getFieldTypeKey = (type: Props['type']) => {
    if (type === 'metric') return 'chipLabel.metrics';
    if (type === 'dimension') return 'chipLabel.dimensions';
    return 'chipLabel.fields';
};

export const SemanticLayerSearchToolCallDescription: FC<Props> = ({
    page,
    searchQuery,
    type,
}) => {
    const { t } = useTranslation('aiCopilotChat');
    const fieldTypeLabel = t(getFieldTypeKey(type));
    const trimmedSearchQuery = searchQuery?.trim();

    return (
        <Text c="dimmed" size="xs">
            {trimmedSearchQuery ? (
                <>
                    {t('toolDescriptions.searchedFieldTypeFor', {
                        fieldType: fieldTypeLabel,
                    })}{' '}
                    <ToolCallChip mx={rem(2)}>
                        {trimmedSearchQuery}
                    </ToolCallChip>
                </>
            ) : (
                <>
                    {t('toolDescriptions.listedFieldType', {
                        fieldType: fieldTypeLabel,
                    })}
                </>
            )}
            {page && page > 1 ? (
                <ToolCallChip mx={rem(2)}>
                    {t('toolDescriptions.page', { page })}
                </ToolCallChip>
            ) : null}
        </Text>
    );
};
