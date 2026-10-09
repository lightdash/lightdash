import {
    isEmptyDashboardFilterRule,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import {
    Badge,
    Box,
    HoverCard,
    ScrollArea,
    Text,
    Tooltip,
} from '@mantine/core';
import { useMemo, type FC } from 'react';
import { getFilterRuleTables } from '../../../components/common/Filters/FilterInputs/utils';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../../providers/Dashboard/useDashboardTileStatusContext';
import classes from './Filter.module.css';
import { getFilterRuleLabels } from './filterLabels';
import { type TruncatedValuesDisplay } from './utils';

type Props = {
    filterRule: DashboardFilterRule;
    field: DashboardFilterableField | undefined;
    truncatedValuesDisplay: TruncatedValuesDisplay;
    isTablesTooltipDisabled: boolean;
};

export const FilterRuleLabel: FC<Props> = ({
    filterRule,
    field,
    truncatedValuesDisplay,
    isTablesTooltipDisabled,
}) => {
    const getUiString = useUiStrings();
    const allFilterableFields = useDashboardContext(
        (c) => c.allFilterableFields,
    );
    const sqlChartTilesMetadata = useDashboardTileStatusContext(
        (c) => c.sqlChartTilesMetadata,
    );
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );

    const filterRuleLabels = useMemo(
        () =>
            getFilterRuleLabels(
                filterRule,
                field,
                sqlChartTilesMetadata,
                getUiString,
            ),
        [filterRule, field, sqlChartTilesMetadata, getUiString],
    );

    const filterRuleTables = useMemo(() => {
        if (!field || !allFilterableFields) return;

        return getFilterRuleTables(
            filterRule,
            field,
            allFilterableFields,
            filterableFieldsByTileUuid,
        );
    }, [filterRule, field, allFilterableFields, filterableFieldsByTileUuid]);

    return (
        <Box
            style={{
                maxWidth: '100%',
                overflow: 'hidden',
            }}
        >
            <Text fz="xs" truncate>
                <Tooltip
                    position="top-start"
                    disabled={
                        isTablesTooltipDisabled || !filterRuleTables?.length
                    }
                    openDelay={1000}
                    offset={8}
                    label={
                        <Text>
                            {getUiString(
                                filterRuleTables?.length === 1
                                    ? 'filters.tableLabel'
                                    : 'filters.tablesLabel',
                            )}
                            <Text span fw={600}>
                                {filterRuleTables?.join(', ')}
                            </Text>
                        </Text>
                    }
                >
                    <Text fw={600} span truncate>
                        {filterRule?.label || filterRuleLabels?.field}{' '}
                    </Text>
                </Tooltip>
                {filterRule?.disabled ||
                (!filterRule?.required &&
                    isEmptyDashboardFilterRule(filterRule)) ? (
                    <Text span c="dimmed" truncate>
                        {getUiString('filters.isAnyValue')}
                    </Text>
                ) : (
                    <>
                        <Text span c="dimmed" truncate>
                            {filterRuleLabels?.operator}{' '}
                        </Text>
                        <Text fw={500} span truncate>
                            {truncatedValuesDisplay.displayedValues.length > 0
                                ? truncatedValuesDisplay.displayedValues.join(
                                      ', ',
                                  )
                                : filterRuleLabels?.value}
                        </Text>
                        {truncatedValuesDisplay.hasMore && (
                            <HoverCard
                                position="bottom"
                                classNames={{
                                    dropdown: classes.additionalValuesList,
                                }}
                            >
                                <HoverCard.Target>
                                    <Badge size="sm" ml={4}>
                                        +
                                        {
                                            truncatedValuesDisplay
                                                .additionalValues.length
                                        }
                                    </Badge>
                                </HoverCard.Target>
                                <HoverCard.Dropdown>
                                    <Text fz="xs" fw={500} c="ldGray.5">
                                        Additional values (
                                        {
                                            truncatedValuesDisplay
                                                .additionalValues.length
                                        }
                                        )
                                    </Text>
                                    <ScrollArea.Autosize
                                        mah={200}
                                        type="always"
                                        scrollbars="y"
                                    >
                                        {truncatedValuesDisplay.additionalValues.map(
                                            (val, idx) => (
                                                <Text
                                                    key={idx}
                                                    fz="xs"
                                                    c="white"
                                                >
                                                    • {val}
                                                </Text>
                                            ),
                                        )}
                                    </ScrollArea.Autosize>
                                </HoverCard.Dropdown>
                            </HoverCard>
                        )}
                    </>
                )}
            </Text>
        </Box>
    );
};
