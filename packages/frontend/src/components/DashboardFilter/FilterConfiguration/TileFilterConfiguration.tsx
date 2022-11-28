import { Checkbox, FormGroup } from '@blueprintjs/core';
import { Popover2Props } from '@blueprintjs/popover2';
import {
    DashboardFilterRule,
    DashboardTile,
    fieldId,
    FilterableField,
    matchFieldByType,
    matchFieldByTypeAndName,
    matchFieldExact,
} from '@lightdash/common';
import { FC, useCallback, useMemo } from 'react';
import { FilterActions } from '.';
import FieldSelect from '../../common/Filters/FieldSelect';
import { Title } from './FilterConfiguration.styled';

interface TileFilterConfigurationProps {
    tiles: DashboardTile[];
    field: FilterableField;
    filterRule: DashboardFilterRule;
    tilesSavedQueryFilters: Record<string, FilterableField[]>;
    popoverProps?: Popover2Props;
    onChange: (
        action: FilterActions,
        tileUuid: string,
        filterUuid?: FilterableField,
    ) => void;
}

const TileFilterConfiguration: FC<TileFilterConfigurationProps> = ({
    tiles,
    field,
    filterRule,
    tilesSavedQueryFilters,
    popoverProps,
    onChange,
}) => {
    const tilesSortBy = useCallback(
        (
            matcher: (a: FilterableField) => (b: FilterableField) => boolean,
            a: FilterableField[],
            b: FilterableField[],
        ) => {
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
        return Object.entries(tilesSavedQueryFilters)
            .sort(([, a], [, b]) => tilesSortBy(matchFieldByTypeAndName, a, b))
            .sort(([, a], [, b]) => tilesSortBy(matchFieldExact, a, b));
    }, [tilesSortBy, tilesSavedQueryFilters]);

    return (
        <>
            <Title>
                Select tiles to apply filter to and which field to filter by
            </Title>

            {sortedTileEntries.map(([tileUuid, savedQueryFilters]) => {
                const tileConfig = filterRule.tileTargetOverride?.find(
                    (t) => t.tileUuid === tileUuid,
                );

                const isAvailable = savedQueryFilters.some((t) =>
                    matchFieldByType(field)(t),
                );
                const isChecked = isAvailable && !!tileConfig;

                const filterableFieldId = tileConfig?.fieldId;
                const filterableField = savedQueryFilters.find(
                    (f) => fieldId(f) === filterableFieldId,
                );

                const tile = tiles.find((t) => t.uuid === tileUuid);

                const sortedItems = savedQueryFilters
                    .filter(matchFieldByType(field))
                    .sort((a, b) => itemsSortBy(matchFieldByTypeAndName, a, b))
                    .sort((a, b) => itemsSortBy(matchFieldExact, a, b));

                return (
                    <FormGroup key={tileUuid}>
                        <Checkbox
                            label={tile?.properties.title}
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
                                items={sortedItems}
                                activeItem={filterableField}
                                onItemSelect={(newFilterableField) => {
                                    onChange(
                                        FilterActions.ADD,
                                        tileUuid,
                                        newFilterableField,
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
