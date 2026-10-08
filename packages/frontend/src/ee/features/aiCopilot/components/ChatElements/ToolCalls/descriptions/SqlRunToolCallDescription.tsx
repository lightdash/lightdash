import { Stack, Text } from '@mantine/core';
import type { FC } from 'react';
import {
    SqlApprovalActions,
    type SqlApprovalTarget,
} from '../SqlApprovalActions';
import { ToolCallSqlBlock } from '../ToolCallSqlBlock';

type SqlRunToolCallDescriptionProps = {
    sql: string;
    limit?: number;
    /** Present while the query waits on the user's approval. */
    approval?: SqlApprovalTarget;
};

export const SqlRunToolCallDescription: FC<SqlRunToolCallDescriptionProps> = ({
    sql,
    limit,
    approval,
}) => (
    <Stack gap={6} align="stretch" w="100%">
        {limit ? (
            <Text c="dimmed" size="xs">
                Row limit: {limit}
            </Text>
        ) : null}
        <ToolCallSqlBlock sql={sql} />
        {approval ? <SqlApprovalActions {...approval} /> : null}
    </Stack>
);
