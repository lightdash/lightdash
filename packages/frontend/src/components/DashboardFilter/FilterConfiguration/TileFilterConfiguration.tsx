import {
    DashboardFilterRule,
    DashboardTile,
    fieldId as getFieldId,
    FilterableField,
    matchFieldByType,
    matchFieldByTypeAndName,
    matchFieldExact,
} from '@lightdash/common';
import { Box, Checkbox, PopoverProps, Stack } from '@mantine/core';
import { FC, useCallback, useMemo } from 'react';
import { FilterActions } from '.';
import FieldAutoComplete from '../../common/Filters/FieldAutoComplete';

interface TileFilterConfigurationProps {
    tiles: DashboardTile[];
    availableTileFilters: Record<string, FilterableField[] | undefined>;
    field: FilterableField;
    filterRule: DashboardFilterRule;
    popoverProps?: Pick<PopoverProps, 'onOpen' | 'onClose'>;
    onChange: (
        action: FilterActions,
        tileUuid: string,
        filter?: FilterableField,
    ) => void;
}

const TileFilterConfiguration: FC<TileFilterConfigurationProps> = ({
    tiles,
    field,
    filterRule,
    availableTileFilters,
    popoverProps,
    onChange,
}) => {
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

    return (
        <Stack spacing="sm" py="md">
            {sortedTileEntries.map(([tileUuid, filters]) => {
                if (!filters) return null;

                const tile = tiles.find((t) => t.uuid === tileUuid);
                const tileConfig = filterRule.tileTargets?.[tileUuid];

                const isAvailable = filters.some(matchFieldByType(field));
                const isChecked = isAvailable && !!tileConfig;

                const fieldId = tileConfig?.fieldId;
                const filter = filters.find((f) => getFieldId(f) === fieldId);

                const sortedFilters = filters
                    .filter(matchFieldByType(field))
                    .sort((a, b) => itemsSortBy(matchFieldByTypeAndName, a, b))
                    .sort((a, b) => itemsSortBy(matchFieldExact, a, b));

                return (
                    <Stack key={tileUuid} spacing="xs">
                        <Checkbox
                            label={tile?.properties.title || undefined}
                            disabled={!isAvailable}
                            checked={isChecked}
                            onChange={() => {
                                onChange(
                                    isChecked
                                        ? FilterActions.REMOVE
                                        : FilterActions.ADD,
                                    tileUuid,
                                );
                            }}
                        />

                        <Box ml="xxl">
                            <FieldAutoComplete
                                disabled={!isAvailable || !isChecked}
                                popoverProps={popoverProps}
                                fields={sortedFilters}
                                activeField={filter}
                                onChange={(newFilter) => {
                                    onChange(
                                        FilterActions.ADD,
                                        tileUuid,
                                        newFilter,
                                    );
                                }}
                            />
                        </Box>
                    </Stack>
                );
            })}
        </Stack>
    );
};

export default TileFilterConfiguration;
