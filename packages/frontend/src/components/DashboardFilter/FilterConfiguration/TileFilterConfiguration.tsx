import { Checkbox, FormGroup } from '@blueprintjs/core';
import { Popover2Props } from '@blueprintjs/popover2';
import {
    AvailableFiltersForSavedQuery,
    byFieldExact,
    byType,
    DashboardFilterRule,
    fieldId,
    FilterableField,
} from '@lightdash/common';
import { FC } from 'react';
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
    // TODO enable sort.
    // const sortByAvailability = (
    //     a: AvailableFiltersForSavedQuery,
    //     b: AvailableFiltersForSavedQuery,
    // ) => {
    //     const isAApplicable = availableFilters?.some((t) => t.uuid === a.uuid);
    //     const isBApplicable = availableFilters?.some((t) => t.uuid === b.uuid);

    //     if (isAApplicable && !isBApplicable) {
    //         return -1;
    //     } else if (!isAApplicable && isBApplicable) {
    //         return 1;
    //     } else {
    //         return 0;
    //     }
    // };

    return (
        <>
            <Title>
                Select tiles to apply filter to and which field to filter by
            </Title>

            {Object.entries(tilesWithSavedQuery).map(
                ([tileUuid, savedQuery]) => {
                    // TODO: fix sort
                    // .sort(sortByAvailability)
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
                                        canEscapeKeyClose:
                                            !popoverProps?.isOpen,
                                        ...popoverProps,
                                    }}
                                />
                            </div>
                        </FormGroup>
                    );
                },
            )}
        </>
    );
};

export default TileFilterConfiguration;
