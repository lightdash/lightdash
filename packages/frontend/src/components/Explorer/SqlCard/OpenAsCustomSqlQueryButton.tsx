import { MetricQuery } from '@lightdash/common';
import { Button } from '@mantine/core';
import { IconEdit } from '@tabler/icons-react';
import { FC, memo } from 'react';
import { Link } from 'react-router-dom';
import { useCompiledSql } from '../../../hooks/useCompiledSql';
import { useCustomCompiledSql } from '../../../hooks/useCustomCompiledSql';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import { COLLAPSABLE_CARD_BUTTON_PROPS } from '../../common/CollapsableCard';
import MantineIcon from '../../common/MantineIcon';

interface Props {
    projectUuid: string;
}

const OpenAsCustomSqlQueryButton: FC<Props> = memo(({ projectUuid }) => {
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

    const {
        data: customSql,
        isInitialLoading: isLoadingCustomSql,
        error,
    } = useCustomCompiledSql(projectUuid, customExplore?.explore, metricQuery);

    const { data: sql, isInitialLoading: isLoadingSql } = useCompiledSql(
        projectUuid,
        tableId,
        metricQuery,
    );

    const query = customSql ?? sql;
    console.log({ tableId, query });

    const searchParams = new URLSearchParams({
        query: query ? btoa(query) : '',
    });

    return (
        <Button
            {...COLLAPSABLE_CARD_BUTTON_PROPS}
            component={Link}
            target="_blank"
            rel="noreferrer noopener"
            to={`/projects/${projectUuid}/explore/new?${searchParams.toString()}`}
            leftIcon={<MantineIcon icon={IconEdit} color="gray" />}
            disabled={isLoadingCustomSql || isLoadingSql || !!error}
        >
            Open as custom SQL query
        </Button>
    );
});

export default OpenAsCustomSqlQueryButton;
