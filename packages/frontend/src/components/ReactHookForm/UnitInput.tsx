import { FC } from 'react';
import UnitInputOriginal, { UnitInputProps } from '../common/UnitInput';
import InputWrapper, { InputWrapperProps } from './InputWrapper';

type UnitInputWrapperProps = Omit<UnitInputProps, 'value' | 'onChange'> &
    Omit<InputWrapperProps, 'render'>;

const UnitInput: FC<UnitInputWrapperProps> = ({ label, ...unitInputProps }) => (
    <InputWrapper
        {...unitInputProps}
        render={(props, { field }) => (
            <UnitInputOriginal
                label={label}
                {...unitInputProps}
                {...field}
                {...props}
            />
        )}
    />
);

export default UnitInput;
