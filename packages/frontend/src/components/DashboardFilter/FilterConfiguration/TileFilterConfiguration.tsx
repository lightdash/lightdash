import { Button, Checkbox, FormGroup } from '@blueprintjs/core';
import { MenuItem2, Popover2Props } from '@blueprintjs/popover2';
import { Select2 } from '@blueprintjs/select';
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
import FieldIcon from '../../common/Filters/FieldIcon';
import FieldLabel from '../../common/Filters/FieldLabel';
import renderFilterItem from '../../common/Filters/renderFilterItem';
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
    const sortByAvailability = (
        a: AvailableFiltersForSavedQuery,
        b: AvailableFiltersForSavedQuery,
    ) => {
        const isAApplicable = availableFilters?.some((t) => t.uuid === a.uuid);
        const isBApplicable = availableFilters?.some((t) => t.uuid === b.uuid);

        if (isAApplicable && !isBApplicable) {
            return -1;
        } else if (!isAApplicable && isBApplicable) {
            return 1;
        } else {
            return 0;
        }
    };

    return (
        <>
            <Title>
                Select tiles to apply filter to and which field to filter by
            </Title>

            {tilesWithSavedQuery &&
                Object.entries(tilesWithSavedQuery).map(
                    ([tileUuid, savedQuery]) => {
                        // TODO: fix sort
                        // .sort(sortByAvailability)
                        const isApplicable = true;
                        // TODO: fix availability
                        // availableFilters?.some(
                        //     (t) => t.uuid === tileUuid,
                        // );

                        const tileConfig = filterRule.tileConfigs?.find(
                            (t) => t.tileUuid === tileUuid,
                        );

                        const isChecked = isApplicable && !!tileConfig;

                        const filterableFieldId = tileConfig?.fieldId;
                        const filterableField = savedQuery.filters.find(
                            (f) => fieldId(f) === filterableFieldId,
                        );

                        const sortedItems = savedQuery.filters
                            .filter(byType(field))
                            .sort((a, b) =>
                                byFieldExact(a)(field) &&
                                !byFieldExact(b)(field)
                                    ? -1
                                    : 1,
                            );

                        return (
                            <FormGroup key={tileUuid}>
                                <Checkbox
                                    label={savedQuery.name}
                                    disabled={!isApplicable}
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
                                    <Select2<FilterableField>
                                        disabled={!isChecked}
                                        fill
                                        filterable={false}
                                        items={sortedItems}
                                        itemRenderer={renderFilterItem}
                                        noResults={
                                            <MenuItem2
                                                disabled
                                                text="No results."
                                            />
                                        }
                                        activeItem={filterableField}
                                        onItemSelect={(newFilterableField) => {
                                            onChange(
                                                FilterActions.ADD,
                                                tileUuid,
                                                newFilterableField,
                                            );
                                        }}
                                        popoverProps={{
                                            lazy: true,
                                            minimal: true,
                                            matchTargetWidth: true,
                                            captureDismiss:
                                                !popoverProps?.isOpen,
                                            canEscapeKeyClose:
                                                !popoverProps?.isOpen,
                                            ...popoverProps,
                                        }}
                                    >
                                        <Button
                                            minimal
                                            alignText="left"
                                            disabled={!isChecked}
                                            outlined
                                            fill
                                            icon={
                                                filterableField && (
                                                    <FieldIcon
                                                        item={filterableField}
                                                    />
                                                )
                                            }
                                            text={
                                                isApplicable ? (
                                                    filterableField ? (
                                                        <FieldLabel
                                                            item={
                                                                filterableField
                                                            }
                                                        />
                                                    ) : (
                                                        'Select field'
                                                    )
                                                ) : (
                                                    'Not applicable'
                                                )
                                            }
                                            rightIcon="caret-down"
                                            placeholder="Select a film"
                                        />
                                    </Select2>
                                </div>
                            </FormGroup>
                        );
                    },
                )}
        </>
    );
};

export default TileFilterConfiguration;
