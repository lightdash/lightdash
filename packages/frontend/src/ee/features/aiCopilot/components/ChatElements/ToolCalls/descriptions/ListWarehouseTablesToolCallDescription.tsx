import { rem, Text } from '@mantine-8/core';
import type { FC } from 'react';
import { ToolCallChip } from '../ToolCallChip';

type ListWarehouseTablesToolCallDescriptionProps = {
    schema: string | null;
    search: string | null;
};

export const ListWarehouseTablesToolCallDescription: FC<
    ListWarehouseTablesToolCallDescriptionProps
> = ({ schema, search }) => {
    if (!schema && !search) {
        return (
            <Text c="dimmed" size="xs">
                Listed warehouse tables
            </Text>
        );
    }
    return (
        <Text c="dimmed" size="xs">
            Listed warehouse tables{' '}
            {schema ? (
                <Text span>
                    <Text c="dimmed" size="xs" span>
                        in schema:
                    </Text>
                    <ToolCallChip mx={rem(2)}>{schema}</ToolCallChip>
                </Text>
            ) : null}
            {search ? (
                <Text span>
                    <Text c="dimmed" size="xs" span>
                        matching:
                    </Text>
                    <ToolCallChip mx={rem(2)}>"{search}"</ToolCallChip>
                </Text>
            ) : null}
        </Text>
    );
};
