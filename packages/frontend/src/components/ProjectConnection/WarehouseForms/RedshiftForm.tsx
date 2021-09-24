import React, { FC } from 'react';
import { Button } from '@blueprintjs/core';
import { useToggle } from 'react-use';
import Input from '../../ReactHookForm/Input';
import NumericInput from '../../ReactHookForm/NumericInput';
import PasswordInput from '../../ReactHookForm/PasswordInput';
import FormSection from '../../ReactHookForm/FormSection';

const RedshiftForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    return (
        <>
            <Input
                name="warehouse.host"
                label="Host"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <Input
                name="warehouse.user"
                label="User"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <PasswordInput
                name="warehouse.password"
                label="Password"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <Input
                name="warehouse.dbname"
                label="DB name"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <Input
                name="warehouse.schema"
                label="Schema"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <FormSection isOpen={isOpen} name="advanced">
                <NumericInput
                    name="warehouse.port"
                    label="Port"
                    rules={{
                        required: 'Required field',
                    }}
                    disabled={disabled}
                    defaultValue={5439}
                />
                <NumericInput
                    name="warehouse.threads"
                    label="Threads"
                    rules={{
                        required: 'Required field',
                    }}
                    disabled={disabled}
                    defaultValue={1}
                />
                <NumericInput
                    name="warehouse.keepalivesIdle"
                    label="Keep alive idle (seconds)"
                    rules={{
                        required: 'Required field',
                    }}
                    disabled={disabled}
                    defaultValue={0}
                />
                <Input
                    name="warehouse.sslmode"
                    label="SSL mode"
                    disabled={disabled}
                />
            </FormSection>
            <div
                style={{
                    display: 'flex',
                    marginTop: 20,
                    justifyContent: 'flex-end',
                }}
            >
                <Button
                    minimal
                    text={`${isOpen ? 'Hide' : 'Show'} advanced fields`}
                    onClick={toggleOpen}
                    style={{
                        marginRight: 10,
                    }}
                />
            </div>
        </>
    );
};

export default RedshiftForm;
