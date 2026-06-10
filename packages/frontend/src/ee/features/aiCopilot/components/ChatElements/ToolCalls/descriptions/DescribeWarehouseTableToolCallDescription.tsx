import { rem, Text } from '@mantine-8/core';
import type { FC } from 'react';
import { ToolCallChip } from '../ToolCallChip';

type DescribeWarehouseTableToolCallDescriptionProps = {
    table: string;
    schema: string | null;
};

export const DescribeWarehouseTableToolCallDescription: FC<
    DescribeWarehouseTableToolCallDescriptionProps
> = ({ table, schema }) => {
    const qualified = schema ? `${schema}.${table}` : table;
    return (
        <Text c="dimmed" size="xs">
            Inspected schema of{' '}
            <ToolCallChip mx={rem(2)}>{qualified}</ToolCallChip>
        </Text>
    );
};
