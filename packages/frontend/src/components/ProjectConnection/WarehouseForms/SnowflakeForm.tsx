import { Button } from '@blueprintjs/core';
import React, { FC } from 'react';
import { useToggle } from 'react-use';
import BooleanSwitch from '../../ReactHookForm/BooleanSwitch';
import FormSection from '../../ReactHookForm/FormSection';
import Input from '../../ReactHookForm/Input';
import NumericInput from '../../ReactHookForm/NumericInput';
import PasswordInput from '../../ReactHookForm/PasswordInput';

const SnowflakeForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    return (
        <>
            <Input
                name="warehouse.account"
                label="Account"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#account"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <Input
                name="warehouse.user"
                label="User"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#user-2"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <PasswordInput
                name="warehouse.password"
                label="Password"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#password-2"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <Input
                name="warehouse.role"
                label="Role"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#role"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <Input
                name="warehouse.database"
                label="Database"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#database"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <Input
                name="warehouse.warehouse"
                label="Warehouse"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#warehouse"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <Input
                name="warehouse.schema"
                label="Schema"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#schema-2"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <FormSection isOpen={isOpen} name="advanced">
                <NumericInput
                    name="warehouse.threads"
                    label="Threads"
                    documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#threads-3"
                    rules={{
                        required: 'Required field',
                    }}
                    disabled={disabled}
                    defaultValue={1}
                />
                <BooleanSwitch
                    name="warehouse.clientSessionKeepAlive"
                    label="Keep client session alive"
                    documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#keep-client-session-alive"
                    disabled={disabled}
                    defaultValue={false}
                />
                <Input
                    name="warehouse.queryTag"
                    label="Query tag"
                    documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#query-tag"
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

export default SnowflakeForm;
