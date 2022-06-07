import { WarehouseTypes } from '@lightdash/common';
import React, { FC } from 'react';
import { useToggle } from 'react-use';
import { hasNoWhiteSpaces } from '../../../utils/fieldValidators';
import FormSection from '../../ReactHookForm/FormSection';
import Input from '../../ReactHookForm/Input';
import NumericInput from '../../ReactHookForm/NumericInput';
import PasswordInput from '../../ReactHookForm/PasswordInput';
import Select from '../../ReactHookForm/Select';
import { AdvancedButton } from '../ProjectConnection.styles';
import { useProjectFormContext } from '../ProjectFormProvider';

export const PostgresSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    return (
        <Input
            name="warehouse.schema"
            label="Schema"
            documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#schema"
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

const PostgresForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.POSTGRES;
    return (
        <>
            <Input
                name="warehouse.host"
                label="Host"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#host"
                rules={{
                    required: 'Required field',
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Host'),
                    },
                }}
                disabled={disabled}
            />
            <Input
                name="warehouse.user"
                label="User"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#user"
                rules={{
                    required: requireSecrets ? 'Required field' : undefined,
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('User'),
                    },
                }}
                placeholder={
                    disabled || !requireSecrets ? '**************' : undefined
                }
                disabled={disabled}
            />
            <PasswordInput
                name="warehouse.password"
                label="Password"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#password"
                rules={{
                    required: requireSecrets ? 'Required field' : undefined,
                }}
                placeholder={
                    disabled || !requireSecrets ? '**************' : undefined
                }
                disabled={disabled}
            />
            <Input
                name="warehouse.dbname"
                label="DB name"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#db-name"
                rules={{
                    required: 'Required field',
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('DB name'),
                    },
                }}
                disabled={disabled}
            />

            <FormSection isOpen={isOpen} name="advanced">
                <NumericInput
                    name="warehouse.port"
                    label="Port"
                    documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#port"
                    rules={{
                        required: 'Required field',
                    }}
                    disabled={disabled}
                    defaultValue={5432}
                />
                <NumericInput
                    name="warehouse.keepalivesIdle"
                    label="Keep alive idle (seconds)"
                    documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#keep-alive-idle-seconds"
                    rules={{
                        required: 'Required field',
                    }}
                    disabled={disabled}
                    defaultValue={0}
                />
                <Input
                    name="warehouse.searchPath"
                    label="Search path"
                    documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#search-path"
                    disabled={disabled}
                />
                <Select
                    name="warehouse.sslmode"
                    label="SSL mode"
                    documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#ssl-mode"
                    options={[
                        'disable',
                        'no-verify',
                        'allow',
                        'prefer',
                        'require',
                        'verify-ca',
                        'verify-full',
                    ].map((x) => ({ value: x, label: x }))}
                    defaultValue="prefer"
                    disabled={disabled}
                />
                <Input name="warehouse.role" label="Role" disabled={disabled} />
            </FormSection>
            <div
                style={{
                    display: 'flex',
                    marginTop: 20,
                    justifyContent: 'flex-end',
                }}
            >
                <AdvancedButton
                    text={`${
                        isOpen ? 'Hide advanced' : 'Advanced'
                    } configuration options`}
                    onClick={toggleOpen}
                />
            </div>
        </>
    );
};

export default PostgresForm;
