import { type ConnectionRoute } from '@lightdash/common';
import { Button } from '@mantine/core';
import { IconTerminal2 } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../common/MantineIcon';

interface OpenInSqlRunnerButtonProps {
    projectUuid: string;
    sql: string | undefined;
    warehouseConnectionUuid: string | null | undefined;
    connectionRoute: ConnectionRoute | undefined;
    disabled?: boolean;
}

const OpenInSqlRunnerButton: FC<OpenInSqlRunnerButtonProps> = memo(
    ({
        projectUuid,
        sql,
        warehouseConnectionUuid,
        connectionRoute,
        disabled,
    }) => {
        return (
            <Button
                variant="default"
                size="xs"
                component={Link}
                to={{
                    pathname: `/projects/${projectUuid}/sql-runner`,
                }}
                state={{
                    sql,
                    ...(connectionRoute === 'multi' &&
                    warehouseConnectionUuid !== undefined
                        ? { warehouseConnectionUuid }
                        : {}),
                }}
                leftSection={
                    <MantineIcon icon={IconTerminal2} color="ldGray.7" />
                }
                disabled={
                    disabled ||
                    !sql ||
                    connectionRoute === undefined ||
                    (connectionRoute === 'multi' &&
                        warehouseConnectionUuid === undefined)
                }
            >
                Open in SQL Runner
            </Button>
        );
    },
);

export default OpenInSqlRunnerButton;
