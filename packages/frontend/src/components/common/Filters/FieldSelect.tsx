import { Button } from '@blueprintjs/core';
import { MenuItem2, Popover2Props } from '@blueprintjs/popover2';
import { Select2 } from '@blueprintjs/select';
import { FilterableField } from '@lightdash/common';
import { FC } from 'react';
import FieldIcon from './FieldIcon';
import FieldLabel from './FieldLabel';
import renderFilterItem from './renderFilterItem';

interface FieldSelectProps {
    available: boolean;
    disabled: boolean;
    items: FilterableField[];
    activeItem?: FilterableField;
    onItemSelect: (newItem: FilterableField) => void;
    popoverProps?: Popover2Props;
}

const FieldSelect: FC<FieldSelectProps> = ({
    available,
    disabled,
    items,
    activeItem,
    onItemSelect,
    popoverProps,
}) => {
    return (
        <Select2<FilterableField>
            disabled={disabled}
            fill
            filterable={false}
            items={items}
            itemRenderer={renderFilterItem}
            noResults={<MenuItem2 disabled text="No results." />}
            activeItem={activeItem}
            onItemSelect={onItemSelect}
            popoverProps={{
                lazy: true,
                minimal: true,
                matchTargetWidth: true,
                ...popoverProps,
            }}
        >
            <Button
                minimal
                alignText="left"
                disabled={disabled}
                outlined
                fill
                icon={activeItem && <FieldIcon item={activeItem} />}
                text={
                    available ? (
                        activeItem ? (
                            <FieldLabel item={activeItem} />
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
    );
};

export default FieldSelect;
