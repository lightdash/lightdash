import { Code, Stack, Text } from '@mantine-8/core';
import type { FC } from 'react';

type SqlRunToolCallDescriptionProps = {
    sql: string;
    limit?: number;
};

export const SqlRunToolCallDescription: FC<SqlRunToolCallDescriptionProps> = ({
    sql,
    limit,
}) => {
    return (
        <Stack gap={4}>
            {limit ? (
                <Text c="dimmed" size="xs">
                    Row limit: {limit}
                </Text>
            ) : null}
            <Code
                block
                style={{ fontSize: 11, maxHeight: 200, overflow: 'auto' }}
            >
                {sql}
            </Code>
        </Stack>
    );
};
