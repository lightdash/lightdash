import { Button, FormGroup, InputGroup, Intent } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { FC, useState } from 'react';

interface Props {
    id?: string;
    label: string;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    value?: string;
    onChange: (value?: string) => void;
}

const PasswordInput: FC<Props> = ({
    id,
    label,
    placeholder,
    required,
    disabled,
    value,
    onChange,
    ...rest
}) => {
    const inputId =
        id || `${label.replace(/[^a-zA-Z]/g, '').replace(/\s/g, '_')}_input`;
    const [showPassword, setShowPassword] = useState<boolean>(false);
    return (
        <FormGroup
            label={label}
            labelFor={inputId}
            labelInfo={required ? '(required)' : undefined}
        >
            <InputGroup
                id={inputId}
                placeholder={placeholder || 'Enter your password...'}
                type={showPassword ? 'text' : 'password'}
                required={required}
                disabled={disabled}
                value={value}
                onChange={(e) => onChange(e.target.value.trim())}
                rightElement={
                    <Tooltip2
                        content={`${showPassword ? 'Hide' : 'Show'} Password`}
                        disabled={disabled}
                    >
                        <Button
                            minimal
                            disabled={disabled}
                            icon={showPassword ? 'eye-off' : 'eye-open'}
                            intent={Intent.WARNING}
                            onClick={() =>
                                setShowPassword((prevState) => !prevState)
                            }
                        />
                    </Tooltip2>
                }
                {...rest}
            />
        </FormGroup>
    );
};

export default PasswordInput;
