import {
    WarehouseTypes,
    type UpsertUserWarehouseCredentials,
} from '@lightdash/common';
import { PasswordInput, TextInput } from '@mantine-8/core';
import { type UseFormReturnType } from '@mantine/form';
import { type FC } from 'react';
import { useGoogleLoginPopup } from '../../../hooks/gdrive/useGdrive';
import { useDatabricksLoginPopup } from '../../../hooks/useDatabricks';
import { useSnowflakeLoginPopup } from '../../../hooks/useSnowflake';
import { BigQuerySSOInput } from '../../ProjectConnection/WarehouseForms/BigQueryForm';
import { DatabricksSSOInput } from '../../ProjectConnection/WarehouseForms/DatabricksForm';
import { SnowflakeSSOInput } from '../../ProjectConnection/WarehouseForms/SnowflakeForm';

const BigQueryFormInput: FC<{ onClose: () => void }> = ({ onClose }) => {
    const { mutate: openLoginPopup } = useGoogleLoginPopup('bigquery', onClose);

    // If this popup happens, it means we don't have warehouse credentials,
    // (aka isAuthenticated is false), so we need to authenticate
    return (
        <BigQuerySSOInput
            isAuthenticated={false}
            disabled={false}
            openLoginPopup={openLoginPopup}
        />
    );
};

export const SnowflakeFormInput: FC<{ onClose: () => void }> = ({
    onClose,
}) => {
    const { mutate: openLoginPopup } = useSnowflakeLoginPopup({
        onLogin: async () => {
            onClose();
        },
    });

    // If this popup happens, it means we don't have warehouse credentials,
    // (aka isAuthenticated is false), so we need to authenticate
    return (
        <SnowflakeSSOInput
            isAuthenticated={false}
            disabled={false}
            openLoginPopup={openLoginPopup}
        />
    );
};

const DatabricksFormInput: FC<{ onClose: () => void }> = ({ onClose }) => {
    const { mutate: openLoginPopup } = useDatabricksLoginPopup({
        onLogin: async () => {
            onClose();
        },
    });

    // If this popup happens, it means we don't have warehouse credentials,
    // (aka isAuthenticated is false), so we need to authenticate
    return (
        <DatabricksSSOInput
            isAuthenticated={false}
            disabled={false}
            openLoginPopup={openLoginPopup}
        />
    );
};

export const WarehouseFormInputs: FC<{
    disabled: boolean;
    form: UseFormReturnType<UpsertUserWarehouseCredentials>;
    onClose: () => void;
}> = ({ form, disabled, onClose }) => {
    switch (form.values.credentials.type) {
        case WarehouseTypes.SNOWFLAKE:
            return <SnowflakeFormInput onClose={onClose} />;
        case WarehouseTypes.REDSHIFT:
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.TRINO:
        case WarehouseTypes.CLICKHOUSE:
            return (
                <>
                    <TextInput
                        required
                        size="xs"
                        label="Username/email"
                        disabled={disabled}
                        {...form.getInputProps('credentials.user')}
                    />
                    <PasswordInput
                        required
                        size="xs"
                        label="Password"
                        disabled={disabled}
                        {...form.getInputProps('credentials.password')}
                    />
                </>
            );
        case WarehouseTypes.BIGQUERY:
            return <BigQueryFormInput onClose={onClose} />;
        case WarehouseTypes.DATABRICKS:
            return <DatabricksFormInput onClose={onClose} />;
        default:
            return null;
    }
};
