import {
    getDataAppVizFieldIds,
    getItemLabelWithoutTableName,
    type DataAppVizFieldMapping,
    type ItemsMap,
    type MetricQuery,
} from '@lightdash/common';
import { Badge, Box, Group, Stack, Text } from '@mantine/core';
import { useMemo, type FC } from 'react';
import DataAppVizFieldTypeBadge from '../components/DataAppVizFieldTypeBadge';
import { dataAppVizFieldPools } from '../utils/autoMapDataAppVizFields';
import { countLabel } from '../utils/countLabel';
import classes from './SuggestedDataCanvasCard.module.css';

type Props = {
    /** The query "Run once and build" would execute. */
    metricQuery: MetricQuery;
    fieldMapping: DataAppVizFieldMapping;
    itemsMap: ItemsMap;
};

/**
 * What the canvas says while a suggestion is on screen: the query that would
 * run, and that nothing has run yet.
 */
const SuggestedDataCanvasCard: FC<Props> = ({
    metricQuery,
    fieldMapping,
    itemsMap,
}) => {
    const pools = useMemo(() => dataAppVizFieldPools(itemsMap), [itemsMap]);
    const boundIds = [
        ...new Set(Object.values(fieldMapping).flatMap(getDataAppVizFieldIds)),
    ];

    return (
        <Stack className={classes.card} gap="xs">
            <Group gap="xs" wrap="nowrap">
                <Text fz="sm" fw={600} c="ldGray.8">
                    Nothing has run yet
                </Text>
                <Badge size="xs" variant="light" color="ldGray">
                    No warehouse query
                </Badge>
            </Group>
            <Text fz="xs" c="dimmed" lh={1.5}>
                {`The fit is checked from field types, not from data. Building runs this query once and keeps the rows for the session: ${countLabel(
                    metricQuery.dimensions.length,
                    'dimension',
                )}, ${countLabel(metricQuery.metrics.length, 'metric')}, limit ${
                    metricQuery.limit
                }.`}
            </Text>
            <Box className={classes.fields}>
                <Group gap="xs" wrap="wrap">
                    {boundIds.map((fieldId) => {
                        const item = itemsMap[fieldId];
                        return (
                            <Group key={fieldId} gap={6} wrap="nowrap">
                                <DataAppVizFieldTypeBadge
                                    type={
                                        pools.metric.includes(fieldId)
                                            ? 'metric'
                                            : 'dimension'
                                    }
                                />
                                <Text fz="xs" c="ldGray.8">
                                    {item
                                        ? getItemLabelWithoutTableName(item)
                                        : fieldId}
                                </Text>
                            </Group>
                        );
                    })}
                </Group>
            </Box>
        </Stack>
    );
};

export default SuggestedDataCanvasCard;
