import {
    FilterOperator,
    isDimensionValueInvalidDate,
    type FilterableField,
    type QuickFilterOperator,
    type ResultValue,
} from '@lightdash/common';
import { Group, Menu, Text } from '@mantine/core';
import { IconFilter, IconFilterX } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import { useFilters } from '../../hooks/useFilters';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';
import TruncatedText from '../common/TruncatedText';
import { useMetricQueryDataContext } from '../MetricQueryData/useMetricQueryDataContext';

const MAX_FILTER_VALUE_WIDTH = 250;

type Props = {
    item: FilterableField;
    value: ResultValue;
    onAddFilter?: (
        item: FilterableField,
        value: unknown,
        timezone: string | undefined,
        operator: QuickFilterOperator,
    ) => void;
};

/**
 * "Show only X" / "Exclude X" quick-filter items for a cell context menu.
 * Requires the explorer store (useFilters) — only render when the
 * visualization is in edit mode with an explorer store available.
 */
const QuickFilterMenuItems: FC<Props> = ({ item, value, onAddFilter }) => {
    const { addFilter: defaultAddFilter } = useFilters();
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

            (onAddFilter ?? defaultAddFilter)(
                item,
                filterValue,
                resolvedTimezone,
                operator,
            );
        },
        [track, onAddFilter, defaultAddFilter, item, value, resolvedTimezone],
    );

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
                >
                    <Group gap={4} wrap="nowrap">
                        <Text span>{label}</Text>
                        <TruncatedText
                            inline
                            fw="bold"
                            fz="inherit"
                            maxWidth={MAX_FILTER_VALUE_WIDTH}
                        >
                            {value.formatted}
                        </TruncatedText>
                    </Group>
                </Menu.Item>
            ))}
        </>
    );
};

export default QuickFilterMenuItems;
