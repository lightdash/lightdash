import { type ApiError } from '@lightdash/common';
import { Box, Button } from '@mantine/core';
import { IconTerminal2 } from '@tabler/icons-react';
import { type useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ComponentProps, type FC } from 'react';
import { Link } from 'react-router';
import CollapsableCard from '../../../components/common/CollapsableCard/CollapsableCard';
import MantineIcon from '../../../components/common/MantineIcon';
import type Table from '../../../components/common/Table';
import MetricFlowSqlCode from './MetricFlowSqlCode';

interface Props {
    projectUuid: string;
    status: ComponentProps<typeof Table>['status'];
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

    const sqlRunnerLink = useMemo(
        () => `/projects/${projectUuid}/sql-runner`,
        [projectUuid],
    );

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
                        to={sqlRunnerLink}
                        state={{ sql }}
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
