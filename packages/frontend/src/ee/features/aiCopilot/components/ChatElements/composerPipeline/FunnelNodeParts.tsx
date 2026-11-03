import { type FunnelSourceQuery, type ItemsMap } from '@lightdash/common';
import { Box, Text } from '@mantine/core';
import { type FC } from 'react';
import chipClasses from '../QueryChip.module.css';
import { useFunnelEventFields, useRangeLabel } from './funnelNodeLabels';
import { FieldChip } from './NodeDetailsRow';

/** The Who / When / Event field chips, each prefixed with its role. */
export const FunnelEventFieldChips: FC<{
    query: FunnelSourceQuery;
    fieldsMap: ItemsMap;
}> = ({ query, fieldsMap }) => {
    const eventFieldsOf = useFunnelEventFields();
    return eventFieldsOf(query).map(({ prefix, fieldId }) => (
        <FieldChip
            key={prefix}
            prefix={prefix}
            fieldId={fieldId}
            fieldsMap={fieldsMap}
            data-testid="funnel-node-event-field"
        />
    ));
};

export const FunnelRangeChip: FC<{ query: FunnelSourceQuery }> = ({
    query,
}) => {
    const rangeLabel = useRangeLabel();
    return (
        <Box
            component="span"
            className={chipClasses.chip}
            data-testid="funnel-node-range"
        >
            <Text component="span" fz="xs" fw={500} truncate>
                {rangeLabel(query.dateRange)}
            </Text>
        </Box>
    );
};
