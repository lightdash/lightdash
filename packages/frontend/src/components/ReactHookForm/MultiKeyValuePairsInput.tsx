import { Button, FormGroup } from '@blueprintjs/core';
import { useFieldArray, useFormContext } from 'react-hook-form';
import Input from './Input';
import {
    AddKeyValuePairRow,
    MultiKeyValuePairRow,
} from './MultiKeyValuePairsInput.styles';

type Props = {
    name: string;
    label: string;
};
export const MultiKeyValuePairsInput = ({ name, label }: Props) => {
    const {
        control,
        register,
        formState: { errors },
    } = useFormContext();
    const { fields, remove, append } = useFieldArray({ name, control });
    return (
        <FormGroup className="input-wrapper" label={label}>
            {fields.map((field, index) => (
                <MultiKeyValuePairRow key={field.id}>
                    <Input name={`${name}.${index}.key`} placeholder="Key" />
                    <Input
                        name={`${name}.${index}.value`}
                        placeholder="Value"
                    />
                    <Button
                        minimal={true}
                        icon={'cross'}
                        onClick={() => remove(index)}
                    />
                </MultiKeyValuePairRow>
            ))}
            <Button
                minimal
                onClick={() => append({ key: '', value: '' })}
                icon={'plus'}
                text="Add variable"
            />
        </FormGroup>
    );
};
