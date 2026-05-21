import { Button, Code, Stack, Text } from '@mantine-8/core';
import { IconTerminal2 } from '@tabler/icons-react';
import type { FC, MouseEvent } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../../../components/common/MantineIcon';
import type { ToolCallActionContext } from '../utils/types';

type SqlRunToolCallDescriptionProps = {
    sql: string;
    limit?: number;
    actionContext?: ToolCallActionContext;
    isSuccessful?: boolean;
};

const OpenInSqlRunnerButton: FC<{
    sql: string;
    limit?: number;
    actionContext: ToolCallActionContext;
}> = ({ sql, limit, actionContext }) => {
    const handleClick = (event: MouseEvent<HTMLElement>) => {
        event.stopPropagation();
    };

    const state = limit ? { sql, limit } : { sql };

    return (
        <Button
            component={Link}
            to={{
                pathname: `/projects/${actionContext.projectUuid}/sql-runner`,
            }}
            state={state}
            size="compact-xs"
            variant="light"
            color="gray"
            leftSection={<MantineIcon icon={IconTerminal2} size={12} />}
            onClick={handleClick}
        >
            Open in SQL Runner
        </Button>
    );
};

export const SqlRunToolCallDescription: FC<SqlRunToolCallDescriptionProps> = ({
    sql,
    limit,
    actionContext,
    isSuccessful = false,
}) => {
    return (
        <Stack gap={6} align="flex-start">
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
            {isSuccessful && actionContext ? (
                <OpenInSqlRunnerButton
                    sql={sql}
                    limit={limit}
                    actionContext={actionContext}
                />
            ) : null}
        </Stack>
    );
};
