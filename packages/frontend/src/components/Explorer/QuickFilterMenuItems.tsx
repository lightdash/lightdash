import {
    FilterOperator,
    isDimensionValueInvalidDate,
    type FilterableField,
    type QuickFilterOperator,
    type ResultValue,
} from '@lightdash/common';
import { Menu, Text } from '@mantine/core';
import { IconFilter, IconFilterX } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import { useFilters } from '../../hooks/useFilters';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';
import { useMetricQueryDataContext } from '../MetricQueryData/useMetricQueryDataContext';

const MAX_FILTER_VALUE_LABEL_LENGTH = 40;

type Props = {
    item: FilterableField;
    value: ResultValue;
};

/**
 * "Show only X" / "Exclude X" quick-filter items for a cell context menu.
 * Requires the explorer store (useFilters) — only render when the
 * visualization is in edit mode with an explorer store available.
 */
const QuickFilterMenuItems: FC<Props> = ({ item, value }) => {
    const { addFilter } = useFilters();
    const { resolvedTimezone } = useMetricQueryDataContext();
    const { track } = useTracking();

    const handleFilterByValue = useCallback(
        (operator: QuickFilterOperator) => {
            track({
                name: EventName.ADD_FILTER_CLICKED,
            });

            const filterValue =
                value.raw === undefined ||
                isDimensionValueInvalidDate(item, value)
                    ? null // Set as null if value is invalid date or undefined
                    : value.raw;

            addFilter(item, filterValue, resolvedTimezone, operator);
        },
        [track, addFilter, item, value, resolvedTimezone],
    );

    const filterValueLabel =
        value.formatted.length > MAX_FILTER_VALUE_LABEL_LENGTH
            ? `${value.formatted.slice(0, MAX_FILTER_VALUE_LABEL_LENGTH)}...`
            : value.formatted;

    return (
        <>
            {(
                [
                    {
                        label: 'Show only',
                        icon: IconFilter,
                        operator: FilterOperator.EQUALS,
                    },
                    {
                        label: 'Exclude',
                        icon: IconFilterX,
                        operator: FilterOperator.NOT_EQUALS,
                    },
                ] as const
            ).map(({ label, icon, operator }) => (
                <Menu.Item
                    key={operator}
                    leftSection={<MantineIcon icon={icon} />}
                    onClick={() => handleFilterByValue(operator)}
                    style={{ maxWidth: 360 }}
                >
                    <Text
                        span
                        fz="inherit"
                        lh="inherit"
                        style={{
                            display: 'block',
                            maxWidth: '100%',
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        <Text span fz="inherit" lh="inherit">
                            {label}&nbsp;
                        </Text>
                        <Text
                            span
                            fz="inherit"
                            lh="inherit"
                            fw="bold"
                            title={value.formatted}
                            style={{
                                minWidth: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {filterValueLabel}
                        </Text>
                    </Text>
                </Menu.Item>
            ))}
        </>
    );
};

export default QuickFilterMenuItems;
