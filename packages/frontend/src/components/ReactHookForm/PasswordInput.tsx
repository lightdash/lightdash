import { ActionIcon, TextInput, Tooltip } from '@mantine/core';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { FC, useState } from 'react';
import MantineIcon from '../common/MantineIcon';
import InputWrapper, { InputWrapperProps } from './InputWrapper';

const PasswordInput: FC<Omit<InputWrapperProps, 'render'>> = (props) => {
    const [showPassword, setShowPassword] = useState<boolean>(false);
    return (
        <InputWrapper
            {...props}
            render={(inputProps, { field }) => (
                <TextInput
                    {...inputProps}
                    className="sentry-block ph-no-capture"
                    placeholder={
                        inputProps.placeholder || 'Enter your password...'
                    }
                    type={showPassword ? 'text' : 'password'}
                    rightSection={
                        <Tooltip
                            label={`${showPassword ? 'Hide' : 'Show'} Password`}
                            disabled={inputProps.disabled}
                        >
                            <ActionIcon
                                disabled={inputProps.disabled}
                                onClick={() =>
                                    setShowPassword((prevState) => !prevState)
                                }
                            >
                                <MantineIcon
                                    icon={showPassword ? IconEyeOff : IconEye}
                                />
                            </ActionIcon>
                        </Tooltip>
                    }
                    {...field}
                />
            )}
        />
    );
};

export default PasswordInput;
