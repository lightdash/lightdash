import { Button, InputGroup, Intent } from '@blueprintjs/core';
import { Tooltip } from '@mantine/core';
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
                    className="sentry-block ph-no-capture"
                    placeholder={
                        inputProps.placeholder || 'Enter your password...'
                    }
                    type={showPassword ? 'text' : 'password'}
                    rightElement={
                        <Tooltip
                            label={`${showPassword ? 'Hide' : 'Show'} Password`}
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
                        </Tooltip>
                    }
                    {...field}
                />
            )}
        />
    );
};

export default PasswordInput;
