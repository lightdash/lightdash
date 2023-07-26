import { Field, getItemId, TableCalculation } from '@lightdash/common';
import { Select } from '@mantine/core';
import { FC } from 'react';
import FieldIcon from '../../common/Filters/FieldIcon';
import { fieldLabelText } from '../../common/Filters/FieldLabel';
import FieldSelectItem from '../FieldSelectItem';

interface Props {
    label?: string;
    selectedField?: Field | TableCalculation;
    fieldOptions: (Field | TableCalculation)[];
    placeholder?: string;
    disabled?: boolean;
    onChange: (newValue: string | null) => void;
}

const FieldSelect: FC<Props> = ({
    label,
    selectedField,
    fieldOptions,
    placeholder,
    disabled,
    onChange,
}) => {
    return (
        <Select
            label={label}
            sx={{ flexGrow: 1 }}
            searchable
            disabled={disabled}
            placeholder={placeholder}
            icon={selectedField && <FieldIcon item={selectedField} />}
            value={selectedField ? getItemId(selectedField) : null}
            data={fieldOptions.map((field) => {
                const id = getItemId(field);
                return {
                    item: field,
                    value: id,
                    label: fieldLabelText(field),
                    disabled:
                        id === (selectedField && getItemId(selectedField)),
                };
            })}
            itemComponent={FieldSelectItem}
            onChange={onChange}
        />
    );
};

export default FieldSelect;
