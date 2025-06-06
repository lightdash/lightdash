import {
    WarehouseTypes,
    type UpsertUserWarehouseCredentials,
} from '@lightdash/common';
import { PasswordInput, TextInput } from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import { type FC } from 'react';
import { useGoogleLoginPopup } from '../../../hooks/gdrive/useGdrive';
import { useSnowflakeLoginPopup } from '../../../hooks/useSnowflake';
import { BigQuerySSOInput } from '../../ProjectConnection/WarehouseForms/BigQueryForm';
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

const SnowflakeFormInput: FC<{ onClose: () => void }> = ({ onClose }) => {
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
            return <>{/* Add personal access token input */}</>;
        default:
            return null;
    }
};
