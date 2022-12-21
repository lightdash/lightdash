import { Checkbox, FormGroup } from '@blueprintjs/core';
import { Popover2Props } from '@blueprintjs/popover2';
import {
    DashboardFilterRule,
    DashboardTile,
    fieldId as getFieldId,
    FilterableField,
    matchFieldByType,
    matchFieldByTypeAndName,
    matchFieldExact,
} from '@lightdash/common';
import { FC, useCallback, useMemo } from 'react';
import { FilterActions } from '.';
import FieldSelect from '../../common/Filters/FieldSelect';

interface TileFilterConfigurationProps {
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
        <>
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
                    <FormGroup key={tileUuid}>
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

                        <div style={{ marginLeft: 24 }}>
                            <FieldSelect
                                available={isAvailable}
                                disabled={!isAvailable || !isChecked}
                                items={sortedFilters}
                                activeItem={filter}
                                onItemSelect={(newFilter) => {
                                    onChange(
                                        FilterActions.ADD,
                                        tileUuid,
                                        newFilter,
                                    );
                                }}
                                popoverProps={popoverProps}
                            />
                        </div>
                    </FormGroup>
                );
            })}
        </>
    );
};

export default TileFilterConfiguration;
