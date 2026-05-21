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
        <Stack gap={6} align="stretch" w="100%">
            {limit ? (
                <Text c="dimmed" size="xs">
                    Row limit: {limit}
                </Text>
            ) : null}
            <Code
                block
                style={{
                    boxSizing: 'border-box',
                    display: 'block',
                    fontSize: 11,
                    maxHeight: 280,
                    overflow: 'auto',
                    width: '100%',
                }}
            >
                {sql}
            </Code>
        </Stack>
    );
};
