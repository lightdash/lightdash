import { Popover2Props } from '@blueprintjs/popover2';
import {
    DashboardFilterRule,
    DashboardTile,
    fieldId as getFieldId,
    FilterableField,
    isDashboardChartTileType,
    matchFieldByType,
    matchFieldByTypeAndName,
    matchFieldExact,
} from '@lightdash/common';
import { Box, Checkbox, Stack, Text, useMantineTheme } from '@mantine/core';
import { useListState } from '@mantine/hooks';
import { FC, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { FilterActions } from '.';
import { useChartSummaries } from '../../../hooks/useChartSummaries';
import FieldAutoComplete from '../../common/Filters/FieldAutoComplete';

type Props = {
    tiles: DashboardTile[];
    availableTileFilters: Record<string, FilterableField[] | undefined>;
    field: FilterableField;
    filterRule: DashboardFilterRule;
    popoverProps?: Popover2Props;
    onChange: (
        action: FilterActions,
        tileUuid: string,
        filter?: FilterableField,
    ) => void;
};

const TileFilterConfiguration: FC<Props> = ({
    tiles,
    field,
    filterRule,
    availableTileFilters,
    popoverProps,
    onChange,
}) => {
    const theme = useMantineTheme();
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { data: savedCharts } = useChartSummaries(projectUuid);

    const tilesSortBy = useCallback(
        (
            matcher: (a: FilterableField) => (b: FilterableField) => boolean,
            a: FilterableField[] | undefined,
            b: FilterableField[] | undefined,
        ) => {
            if (!a || !b) return 0;

            const matchA = a.some(matcher(field));
            const matchB = b.some(matcher(field));
            return matchA === matchB ? 0 : matchA ? -1 : 1;
        },
        [field],
    );

    const itemsSortBy = useCallback(
        (
            matcher: (a: FilterableField) => (b: FilterableField) => boolean,
            a: FilterableField,
            b: FilterableField,
        ) => {
            const matchA = matcher(field)(a);
            const matchB = matcher(field)(b);
            return matchA === matchB ? 0 : matchA ? -1 : 1;
        },
        [field],
    );

    const sortedTileEntries = useMemo(() => {
        return Object.entries(availableTileFilters)
            .sort(([, a], [, b]) => tilesSortBy(matchFieldByTypeAndName, a, b))
            .sort(([, a], [, b]) => tilesSortBy(matchFieldExact, a, b));
    }, [tilesSortBy, availableTileFilters]);

    const initialFilterTilesValues = sortedTileEntries.map(
        ([tileUuid, filters], index) => {
            const tile = tiles.find((t) => t.uuid === tileUuid);
            const tileConfig = filterRule.tileTargets?.[tileUuid];

            const isAvailable = filters?.some(matchFieldByType(field));
            const sortedFilters = filters
                ?.filter(matchFieldByType(field))
                .sort((a, b) => itemsSortBy(matchFieldByTypeAndName, a, b))
                .sort((a, b) => itemsSortBy(matchFieldExact, a, b));

            const fieldId = tileConfig?.fieldId;
            const filter = filters?.find((f) => getFieldId(f) === fieldId);
            const hasNoTitle =
                !tile?.properties.title || tile.properties.title.length === 0;
            const isChartTile = tile && isDashboardChartTileType(tile);

            let label = '';
            if (tile) {
                if (hasNoTitle && isChartTile) {
                    const matchingChart = savedCharts?.find(
                        (chart) =>
                            chart.uuid === tile.properties.savedChartUuid,
                    );
                    label = matchingChart?.name || '';
                } else if (tile.properties.title) {
                    label = tile.properties.title;
                }
            }
            return {
                key: tileUuid + index,
                label,
                checked: Boolean(isAvailable && tileConfig),
                tileUuid,
                sortedFilters,
                filter,
            };
        },
    );

    const [values, handlers] = useListState(initialFilterTilesValues);

    const allChecked = values.every(({ checked }) => checked);
    const indeterminate = values.some(({ checked }) => checked) && !allChecked;

    const items = values.map((value, index) => (
        <>
            <Checkbox
                size="xs"
                fw={500}
                label={value.label}
                key={value.key}
                checked={value.checked}
                onChange={(event) => {
                    handlers.setItemProp(
                        index,
                        'checked',
                        event.currentTarget.checked,
                    );

                    onChange(
                        event.currentTarget.checked
                            ? FilterActions.ADD
                            : FilterActions.REMOVE,
                        value.tileUuid,
                    );
                }}
            />

            {value.sortedFilters && (
                <Box ml={24} display={!value.checked ? 'none' : 'auto'}>
                    <FieldAutoComplete
                        disabled={!value.checked}
                        popoverProps={{
                            lazy: true,
                            minimal: true,
                            matchTargetWidth: true,
                            ...popoverProps,
                        }}
                        inputProps={{
                            // TODO: Remove once this component is migrated to Mantine
                            style: {
                                borderRadius: '3px',
                                boxShadow: 'none',
                                fontSize: theme.fontSizes.xs,
                            },
                        }}
                        fields={value.sortedFilters}
                        activeField={value.filter}
                        onChange={(newFilter) => {
                            handlers.setItemProp(index, 'filter', newFilter);

                            onChange(
                                FilterActions.ADD,
                                value.tileUuid,
                                newFilter,
                            );
                        }}
                    />
                </Box>
            )}
        </>
    ));

    return (
        <Stack spacing="lg">
            <Checkbox
                size="xs"
                checked={allChecked}
                indeterminate={indeterminate}
                label={
                    <Text fw={500} fz="xs" color="gray.7">
                        Select all
                    </Text>
                }
                transitionDuration={0}
                onChange={() =>
                    handlers.setState((current) =>
                        current.map((value) => ({
                            ...value,
                            checked: !allChecked,
                        })),
                    )
                }
            />
            <Stack spacing="xs" ml={8}>
                {items}
            </Stack>
        </Stack>
    );
};

export default TileFilterConfiguration;
