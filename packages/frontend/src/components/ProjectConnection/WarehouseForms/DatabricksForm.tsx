import React, { FC } from 'react';
import { hasNoWhiteSpaces } from '../../../utils/fieldValidators';
import Input from '../../ReactHookForm/Input';
import PasswordInput from '../../ReactHookForm/PasswordInput';

export const DatabricksSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    return (
        <Input
            name="warehouse.schema"
            label="Schema"
            documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project/#database-1"
            rules={{
                required: 'Required field',
                validate: {
                    hasNoWhiteSpaces: hasNoWhiteSpaces('Schema'),
                },
            }}
            disabled={disabled}
        />
    );
};

const DatabricksForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    return (
        <>
            <Input
                name="warehouse.serverHostName"
                label="Server host name"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#server-hostname"
                rules={{
                    required: 'Required field',
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Server host name'),
                    },
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
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('HTTP Path'),
                    },
                }}
                disabled={disabled}
                placeholder="/sql/protocolv1/o/xxxx/xxxx"
            />
            <PasswordInput
                name="warehouse.personalAccessToken"
                label="Personal access token"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#personal-access-token"
                rules={{
                    required: 'Required field',
                }}
                placeholder="**************"
                disabled={disabled}
            />
            <Input
                name="warehouse.catalog"
                label="Catalog name"
                labelHelp="This is the catalog name."
                rules={{
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Catalog name'),
                    },
                }}
                placeholder="hive_metastore"
                disabled={disabled}
            />
        </>
    );
};

export default DatabricksForm;
