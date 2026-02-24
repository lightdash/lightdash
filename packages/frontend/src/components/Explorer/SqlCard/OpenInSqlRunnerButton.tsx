import { Button } from '@mantine-8/core';
import { IconTerminal2 } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../common/MantineIcon';

interface OpenInSqlRunnerButtonProps {
    projectUuid: string;
    sql: string | undefined;
    disabled?: boolean;
}

const OpenInSqlRunnerButton: FC<OpenInSqlRunnerButtonProps> = memo(
    ({ projectUuid, sql, disabled }) => {
        return (
            <Button
                variant="default"
                size="xs"
                component={Link}
                to={{
                    pathname: `/projects/${projectUuid}/sql-runner`,
                }}
                state={{ sql }} // pass SQL as location state
                leftSection={
                    <MantineIcon icon={IconTerminal2} color="ldGray.7" />
                }
                disabled={disabled || !sql}
            >
                Open in SQL Runner
            </Button>
        );
    },
);

export default OpenInSqlRunnerButton;
