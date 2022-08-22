import { Button, InputGroup, Intent } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { FC, useState } from 'react';
import InputWrapper, { InputWrapperProps } from './InputWrapper';

const PasswordInput: FC<Omit<InputWrapperProps, 'render'>> = (props) => {
    const [showPassword, setShowPassword] = useState<boolean>(false);
    return (
        <InputWrapper
            {...props}
            render={(inputProps, { field }) => (
                <InputGroup
                    {...inputProps}
                    className="cohere-block"
                    placeholder={
                        inputProps.placeholder || 'Enter your password...'
                    }
                    type={showPassword ? 'text' : 'password'}
                    rightElement={
                        <Tooltip2
                            content={`${
                                showPassword ? 'Hide' : 'Show'
                            } Password`}
                            disabled={inputProps.disabled}
                        >
                            <Button
                                minimal
                                disabled={inputProps.disabled}
                                icon={showPassword ? 'eye-off' : 'eye-open'}
                                intent={Intent.WARNING}
                                onClick={() =>
                                    setShowPassword((prevState) => !prevState)
                                }
                            />
                        </Tooltip2>
                    }
                    {...field}
                />
            )}
        />
    );
};

export default PasswordInput;
