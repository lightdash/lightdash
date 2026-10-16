import { rem, Text } from '@mantine/core';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolCallChip } from '../ToolCallChip';

type ListWarehouseTablesToolCallDescriptionProps = {
    schema: string | null;
    search: string | null;
};

export const ListWarehouseTablesToolCallDescription: FC<
    ListWarehouseTablesToolCallDescriptionProps
> = ({ schema, search }) => {
    const { t } = useTranslation('aiCopilotChat');
    if (!schema && !search) {
        return (
            <Text c="dimmed" size="xs">
                {t('toolDescriptions.listedWarehouseTables')}
            </Text>
        );
    }
    return (
        <Text c="dimmed" size="xs">
            {t('toolDescriptions.listedWarehouseTables')}{' '}
            {schema ? (
                <Text span>
                    <Text c="dimmed" size="xs" span>
                        {t('toolDescriptions.inSchema')}
                    </Text>
                    <ToolCallChip mx={rem(2)}>{schema}</ToolCallChip>
                </Text>
            ) : null}
            {search ? (
                <Text span>
                    <Text c="dimmed" size="xs" span>
                        {t('toolDescriptions.matching')}
                    </Text>
                    <ToolCallChip mx={rem(2)}>"{search}"</ToolCallChip>
                </Text>
            ) : null}
        </Text>
    );
};
