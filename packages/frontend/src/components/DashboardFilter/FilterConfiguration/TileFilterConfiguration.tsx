import { Checkbox, FormGroup } from '@blueprintjs/core';
import { Popover2Props } from '@blueprintjs/popover2';
import {
    AvailableFiltersForSavedQuery,
    DashboardFilterRule,
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
    field: FilterableField;
    filterRule: DashboardFilterRule;
    tilesWithSavedQuery: Record<string, AvailableFiltersForSavedQuery>;
    popoverProps?: Popover2Props;
    onChange: (
        action: FilterActions,
        tileUuid: string,
        filterUuid?: FilterableField,
    ) => void;
}

const TileFilterConfiguration: FC<TileFilterConfigurationProps> = ({
    field,
    filterRule,
    tilesWithSavedQuery,
    popoverProps,
    onChange,
}) => {
    const tilesSortBy = useCallback(
        (
            matcher: (a: FilterableField) => (b: FilterableField) => boolean,
            a: AvailableFiltersForSavedQuery,
            b: AvailableFiltersForSavedQuery,
        ) => {
            const matchA = a.filters.some(matcher(field));
            const matchB = b.filters.some(matcher(field));
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
        return Object.entries(tilesWithSavedQuery)
            .sort(([, a], [, b]) => tilesSortBy(matchFieldByTypeAndName, a, b))
            .sort(([, a], [, b]) => tilesSortBy(matchFieldExact, a, b));
    }, [tilesSortBy, tilesWithSavedQuery]);

    return (
        <>
            <Title>
                Select tiles to apply filter to and which field to filter by
            </Title>

            {sortedTileEntries.map(([tileUuid, savedQuery]) => {
                const tileConfig = filterRule.tileConfigs?.find(
                    (t) => t.tileUuid === tileUuid,
                );

                const isAvailable = savedQuery.filters.some((t) =>
                    matchFieldByType(field)(t),
                );
                const isChecked = isAvailable && !!tileConfig;

                const filterableFieldId = tileConfig?.fieldId;
                const filterableField = savedQuery.filters.find(
                    (f) => fieldId(f) === filterableFieldId,
                );

                const sortedItems = savedQuery.filters
                    .filter(matchFieldByType(field))
                    .sort((a, b) => itemsSortBy(matchFieldByTypeAndName, a, b))
                    .sort((a, b) => itemsSortBy(matchFieldExact, a, b));

                return (
                    <FormGroup key={tileUuid}>
                        <Checkbox
                            label={savedQuery.name}
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
