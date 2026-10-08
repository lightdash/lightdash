import { Code, Group, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconTerminal2 } from '@tabler/icons-react';
import type { FC } from 'react';
import { AiSqlModal } from '../../AiSqlModal';
import { SqlExpandButton } from '../SqlApprovalCard';

type SqlRunToolCallDescriptionProps = {
    sql: string;
    limit?: number;
};

export const SqlRunToolCallDescription: FC<SqlRunToolCallDescriptionProps> = ({
    sql,
    limit,
}) => {
    const [expanded, { open, close }] = useDisclosure(false);
    const limitLabel = limit ? `Row limit: ${limit}` : null;

    return (
        <Stack gap={6} align="stretch" w="100%">
            <Group gap="xs" wrap="nowrap" justify="space-between">
                <Text c="dimmed" size="xs">
                    {limitLabel}
                </Text>
                <SqlExpandButton onClick={open} />
            </Group>
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
            <AiSqlModal
                opened={expanded}
                onClose={close}
                sql={sql}
                title="SQL query"
                icon={IconTerminal2}
                subtitle={limitLabel}
                copyPlacement="inline"
            />
        </Stack>
    );
};
