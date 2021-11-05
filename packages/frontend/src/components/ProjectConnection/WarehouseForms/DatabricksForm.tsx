import React, { FC } from 'react';
import { Button } from '@blueprintjs/core';
import { useToggle } from 'react-use';
import Input from '../../ReactHookForm/Input';
import NumericInput from '../../ReactHookForm/NumericInput';
import PasswordInput from '../../ReactHookForm/PasswordInput';

const DatabricksForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    return (
        <>
            <Input
                name="warehouse.serverHostName"
                label="Server host name"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#server-host-name"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <Input
                name="warehouse.httpPath"
                label="HTTP Path"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#http-path"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <PasswordInput
                name="warehouse.personalAccessToken"
                label="Personal access token"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#personal-access-token"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <Input
                name="warehouse.database"
                label="database"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#database"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <NumericInput
                name="warehouse.port"
                label="Port"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#port"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
                defaultValue={443}
            />
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

export default DatabricksForm;
