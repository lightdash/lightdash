import React, { FC } from 'react';
import Input from '../../ReactHookForm/Input';
import NumericInput from '../../ReactHookForm/NumericInput';
import PasswordInput from '../../ReactHookForm/PasswordInput';

const DatabricksForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => (
    <>
        <Input
            name="warehouse.serverHostName"
            label="Server host name"
            documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#server-host-name"
            rules={{
                required: 'Required field',
            }}
            disabled={disabled}
            placeholder="xxxx.gcp.databricks.com"
        />
        <Input
            name="warehouse.httpPath"
            label="HTTP Path"
            documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#http-path"
            rules={{
                required: 'Required field',
            }}
            disabled={disabled}
            placeholder="sql/protocolv1/o/xxxx/xxxx"
        />
        <PasswordInput
            name="warehouse.personalAccessToken"
            label="Personal access token"
            documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#personal-access-token"
            rules={{
                required: 'Required field',
            }}
            placeholder={disabled ? '*******' : undefined}
            disabled={disabled}
        />
        <Input
            name="warehouse.database"
            label="database"
            documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#database-1"
            rules={{
                required: 'Required field',
            }}
            disabled={disabled}
        />
        <NumericInput
            name="warehouse.port"
            label="Port"
            documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#port-2"
            rules={{
                required: 'Required field',
            }}
            disabled={disabled}
            defaultValue={443}
        />
    </>
);

export default DatabricksForm;
