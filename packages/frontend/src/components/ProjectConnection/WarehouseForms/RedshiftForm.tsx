import { Button } from '@blueprintjs/core';
import React, { FC } from 'react';
import { useToggle } from 'react-use';
import FormSection from '../../ReactHookForm/FormSection';
import Input from '../../ReactHookForm/Input';
import NumericInput from '../../ReactHookForm/NumericInput';
import PasswordInput from '../../ReactHookForm/PasswordInput';
import Select from '../../ReactHookForm/Select';

const RedshiftForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    return (
        <>
            <Input
                name="warehouse.host"
                label="Host"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#host-1"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <Input
                name="warehouse.user"
                label="User"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#user-1"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <PasswordInput
                name="warehouse.password"
                label="Password"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#password-1"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <Input
                name="warehouse.dbname"
                label="DB name"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#db-name-1"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <Input
                name="warehouse.schema"
                label="Schema"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#schema-1"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <FormSection isOpen={isOpen} name="advanced">
                <NumericInput
                    name="warehouse.port"
                    label="Port"
                    documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#port-1"
                    rules={{
                        required: 'Required field',
                    }}
                    disabled={disabled}
                    defaultValue={5439}
                />
                <NumericInput
                    name="warehouse.threads"
                    label="Threads"
                    documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#threads-2"
                    rules={{
                        required: 'Required field',
                    }}
                    disabled={disabled}
                    defaultValue={1}
                />
                <NumericInput
                    name="warehouse.keepalivesIdle"
                    label="Keep alive idle (seconds)"
                    documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#keep-alive-idle-seconds-1"
                    rules={{
                        required: 'Required field',
                    }}
                    disabled={disabled}
                    defaultValue={0}
                />
                <Select
                    name="warehouse.sslmode"
                    label="SSL mode"
                    options={[
                        'disable',
                        'allow',
                        'prefer',
                        'require',
                        'verify-ca',
                        'verify-full',
                    ].map((x) => ({ value: x, label: x }))}
                    defaultValue="prefer"
                    documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#ssl-mode"
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
