import { FC } from 'react';
import UnitInputOriginal, { UnitInputProps } from '../common/UnitInput';
import InputWrapper, { InputWrapperProps } from './InputWrapper';

type UnitInputWrapperProps = Omit<UnitInputProps, 'value' | 'onChange'> &
    Omit<InputWrapperProps, 'render'>;

const UnitInput: FC<UnitInputWrapperProps> = ({ ...unitInputProps }) => (
    <InputWrapper
        {...unitInputProps}
        render={(props, { field }) => (
            <UnitInputOriginal
                {...unitInputProps}
                {...field}
                {...props}
                value={field.value}
                onChange={(value) => field.onChange(value)}
            />
        )}
    />
);
export default UnitInput;
