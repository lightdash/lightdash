import { MetricQuery } from '@lightdash/common';
import { Button } from '@mantine/core';
import { IconTerminal2 } from '@tabler/icons-react';
import { FC, memo } from 'react';
import { Link } from 'react-router-dom';
import { useCompiledSql } from '../../../hooks/useCompiledSql';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import { COLLAPSABLE_CARD_BUTTON_PROPS } from '../../common/CollapsableCard';
import MantineIcon from '../../common/MantineIcon';

interface OpenInSqlRunnerButtonProps {
    projectUuid: string;
}

const OpenInSqlRunnerButton: FC<OpenInSqlRunnerButtonProps> = memo(
    ({ projectUuid }) => {
        const customExplore = useExplorerContext((c) => c.state.customExplore);

        const tableId = useExplorerContext(
            (context) => context.state.unsavedChartVersion.tableName,
        );

        const {
            dimensions,
            metrics,
            sorts,
            filters,
            limit,
            tableCalculations,
            additionalMetrics,
            customDimensions,
        } = useExplorerContext(
            (context) => context.state.unsavedChartVersion.metricQuery,
        );

        const metricQuery: MetricQuery = {
            exploreName: tableId ?? customExplore?.explore.name,
            dimensions: Array.from(dimensions),
            metrics: Array.from(metrics),
            sorts,
            filters,
            limit: limit || 500,
            tableCalculations,
            additionalMetrics,
            customDimensions,
        };

        const { data, isInitialLoading, error } = useCompiledSql(
            projectUuid,
            tableId,
            metricQuery,
        );
        const searchParams = new URLSearchParams({
            sql_runner: JSON.stringify({ sql: data ?? '' }),
        });

        return (
            <Button
                {...COLLAPSABLE_CARD_BUTTON_PROPS}
                component={Link}
                to={`/projects/${projectUuid}/sqlRunner?${searchParams.toString()}`}
                leftIcon={<MantineIcon icon={IconTerminal2} color="gray" />}
                disabled={isInitialLoading || !!error}
            >
                Open in SQL Runner
            </Button>
        );
    },
);

export default OpenInSqlRunnerButton;
