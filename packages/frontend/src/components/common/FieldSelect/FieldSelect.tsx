import { Field, getItemId, TableCalculation } from '@lightdash/common';
import { Select, SelectProps } from '@mantine/core';
import { FC } from 'react';
import FieldIcon from '../Filters/FieldIcon';
import { fieldLabelText } from '../Filters/FieldLabel';
import FieldSelectItem from './FieldSelectItem';

type Props = Omit<SelectProps, 'data'> & {
    label?: string;
    selectedField?: Field | TableCalculation;
    fieldOptions: (Field | TableCalculation)[];
};

const FieldSelect: FC<Props> = ({
    label,
    selectedField,
    fieldOptions,
    placeholder,
    disabled,
    onChange,
    ...rest
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
            {...rest}
        />
    );
};

export default FieldSelect;
