import { ApiError } from '@lightdash/common';
import { Box, Button } from '@mantine/core';
import { IconTerminal2 } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { FC, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import CollapsableCard from '../../../components/common/CollapsableCard';
import MantineIcon from '../../../components/common/MantineIcon';
import MetricFlowSqlCode from './MetricFlowSqlCode';

interface Props {
    projectUuid: string;
    status: ReturnType<typeof useQuery>['status'];
    sql: string | null | undefined;
    error: ReturnType<typeof useQuery<any, ApiError>>['error'];
    canRedirectToSqlRunner: boolean | undefined;
}

const MetricFlowSqlCard: FC<Props> = ({
    projectUuid,
    status,
    sql,
    error,
    canRedirectToSqlRunner = false,
}) => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const sqlRunnerUrl = useMemo(() => {
        const params = new URLSearchParams({
            sql_runner: JSON.stringify({
                sql: sql ?? '',
            }),
        });
        return `/projects/${projectUuid}/sqlRunner?${params.toString()}`;
    }, [projectUuid, sql]);
    return (
        <CollapsableCard
            title="SQL"
            isOpen={isOpen}
            onToggle={() => setIsOpen(!isOpen)}
            rightHeaderElement={
                canRedirectToSqlRunner &&
                isOpen && (
                    <Button
                        variant="default"
                        size="xs"
                        component={Link}
                        to={sqlRunnerUrl}
                        leftIcon={
                            <MantineIcon icon={IconTerminal2} color="gray" />
                        }
                        disabled={status !== 'success' || !sql}
                    >
                        Open in SQL Runner
                    </Button>
                )
            }
        >
            <Box m={'xs'}>
                <MetricFlowSqlCode status={status} sql={sql} error={error} />
            </Box>
        </CollapsableCard>
    );
};

export default MetricFlowSqlCard;
