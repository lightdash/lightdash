import { Checkbox, FormGroup } from '@blueprintjs/core';
import { Popover2Props } from '@blueprintjs/popover2';
import {
    AvailableFiltersForSavedQuery,
    byFieldExact,
    byType,
    byTypeAndName,
    DashboardFilterRule,
    fieldId,
    FilterableField,
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
    const sortBy = useCallback(
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

    const sortedTileEntries = useMemo(() => {
        return Object.entries(tilesWithSavedQuery)
            .sort(([, a], [, b]) => sortBy(byTypeAndName, a, b))
            .sort(([, a], [, b]) => sortBy(byFieldExact, a, b));
    }, [sortBy, tilesWithSavedQuery]);

    return (
        <>
            <Title>
                Select tiles to apply filter to and which field to filter by
            </Title>

            {sortedTileEntries.map(([tileUuid, savedQuery]) => {
                const isAvailable = true;
                // TODO: fix availability
                // availableFilters?.some(
                //     (t) => t.uuid === tileUuid,
                // );

                const tileConfig = filterRule.tileConfigs?.find(
                    (t) => t.tileUuid === tileUuid,
                );

                const isChecked = isAvailable && !!tileConfig;

                const filterableFieldId = tileConfig?.fieldId;
                const filterableField = savedQuery.filters.find(
                    (f) => fieldId(f) === filterableFieldId,
                );

                const sortedItems = savedQuery.filters
                    .filter(byType(field))
                    .sort((a, b) =>
                        byFieldExact(a)(field) && !byFieldExact(b)(field)
                            ? -1
                            : 1,
                    );

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

                        <div
                            style={{
                                marginLeft: 24,
                            }}
                        >
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
                                popoverProps={{
                                    captureDismiss: !popoverProps?.isOpen,
                                    canEscapeKeyClose: !popoverProps?.isOpen,
                                    ...popoverProps,
                                }}
                            />
                        </div>
                    </FormGroup>
                );
            })}
        </>
    );
};

export default TileFilterConfiguration;
