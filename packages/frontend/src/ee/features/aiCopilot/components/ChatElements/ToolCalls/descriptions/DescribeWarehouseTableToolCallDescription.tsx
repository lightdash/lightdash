import { rem, Text } from '@mantine/core';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolCallChip } from '../ToolCallChip';

type DescribeWarehouseTableToolCallDescriptionProps = {
    table: string;
    schema: string | null;
};

export const DescribeWarehouseTableToolCallDescription: FC<
    DescribeWarehouseTableToolCallDescriptionProps
> = ({ table, schema }) => {
    const { t } = useTranslation('aiCopilotChat');
    const qualified = schema ? `${schema}.${table}` : table;
    return (
        <Text c="dimmed" size="xs">
            {t('toolDescriptions.inspectedSchemaOf')}{' '}
            <ToolCallChip mx={rem(2)}>{qualified}</ToolCallChip>
        </Text>
    );
};
