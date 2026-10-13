import { type ConnectionRoute, type Project } from '@lightdash/common';
import { Button } from '@mantine/core';
import { IconTerminal2 } from '@tabler/icons-react';
import { memo, type FC, type MouseEvent } from 'react';
import { useHref } from 'react-router';
import {
    SQL_RUNNER_HANDOFF_PARAM,
    writeSqlRunnerHandoff,
} from '../../../features/sqlRunner/utils/sqlRunnerHandoff';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';

interface OpenInSqlRunnerButtonProps {
    projectUuid: string;
    sql: string | undefined;
    warehouseConnectionUuid: string | null | undefined;
    connectionRoute: ConnectionRoute | undefined;
    project:
        | Pick<Project, 'organizationUuid' | 'warehouseConnection'>
        | undefined;
    disabled?: boolean;
}

const OpenInSqlRunnerButton: FC<OpenInSqlRunnerButtonProps> = memo(
    ({
        projectUuid,
        sql,
        warehouseConnectionUuid,
        connectionRoute,
        project,
        disabled,
    }) => {
        const { user } = useApp();
        const { track } = useTracking();
        const carriesConnection =
            connectionRoute === 'multi' &&
            warehouseConnectionUuid !== undefined;
        const isExtraConnection =
            carriesConnection && typeof warehouseConnectionUuid === 'string';

        const sqlRunnerHref = useHref(`/projects/${projectUuid}/sql-runner`);

        const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
            event.preventDefault();
            if (connectionRoute === undefined || !sql) return;
            const handoffId = writeSqlRunnerHandoff({
                sql,
                ...(carriesConnection ? { warehouseConnectionUuid } : {}),
            });
            window.open(
                handoffId
                    ? `${sqlRunnerHref}?${SQL_RUNNER_HANDOFF_PARAM}=${handoffId}`
                    : sqlRunnerHref,
                '_blank',
                'noopener',
            );
            track({
                name: EventName.OPEN_IN_SQL_RUNNER_CLICKED,
                properties: {
                    organizationId:
                        project?.organizationUuid ??
                        user.data?.organizationUuid ??
                        null,
                    projectId: projectUuid,
                    connectionCount: null,
                    entryPoint: 'explorer_sql_card',
                    connectionRoute,
                    carriesConnection,
                    warehouseConnectionId: isExtraConnection
                        ? warehouseConnectionUuid
                        : null,
                    connectionKind: isExtraConnection ? 'extra' : 'primary',
                    warehouseType: isExtraConnection
                        ? null
                        : (project?.warehouseConnection?.type ?? null),
                },
            });
        };

        return (
            <Button
                variant="default"
                size="xs"
                component="a"
                href={sqlRunnerHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleClick}
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
