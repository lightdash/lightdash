import { Box } from '@mantine/core';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Fragment, type FC, type ReactNode } from 'react';
import { useMetricChartAnalytics } from '../metricsCatalog/hooks/useMetricChartAnalytics';
import { type Field } from './model';
import classes from './shared.module.css';

dayjs.extend(relativeTime);

type Props = {
    field: Field;
    warehouseProjectUuid: string | null;
};

/** Where the field comes from, its charts and its last change, in a line. */
const FieldSummary: FC<Props> = ({ field, warehouseProjectUuid }) => {
    const analytics = useMetricChartAnalytics({
        projectUuid: warehouseProjectUuid ?? undefined,
        table: field.table,
        field: field.name,
    });
    const chartUsage =
        warehouseProjectUuid !== null
            ? analytics.isSuccess
                ? analytics.data.charts.length
                : null
            : field.chartUsage;
    const parts: ReactNode[] = [
        <Box component="span" key="definition">
            {field.definition.label}{' '}
            <Box component="code" className={classes.detailSummaryCode}>
                {field.definition.value}
            </Box>
        </Box>,
    ];
    if (chartUsage !== null) {
        parts.push(
            chartUsage
                ? `Used in ${chartUsage.toLocaleString()} chart${chartUsage === 1 ? '' : 's'}`
                : 'Not used in any chart',
        );
    }
    if (field.lastEdit) {
        parts.push(
            `Changed by ${field.lastEdit.by} ${dayjs(field.lastEdit.at).fromNow()}`,
        );
    }
    return (
        <>
            {parts.map((part, index) => (
                <Fragment key={index}>
                    {index > 0 ? ' · ' : null}
                    {part}
                </Fragment>
            ))}
        </>
    );
};

export default FieldSummary;
