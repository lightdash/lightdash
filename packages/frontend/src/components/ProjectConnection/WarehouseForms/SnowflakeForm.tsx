import { WarehouseTypes } from '@lightdash/common';
import React, { FC } from 'react';
import { useToggle } from 'react-use';
import { hasNoWhiteSpaces, isUppercase } from '../../../utils/fieldValidators';
import BooleanSwitch from '../../ReactHookForm/BooleanSwitch';
import FormSection from '../../ReactHookForm/FormSection';
import Input from '../../ReactHookForm/Input';
import PasswordInput from '../../ReactHookForm/PasswordInput';
import {
    AdvancedButton,
    AdvancedButtonWrapper,
} from '../ProjectConnection.styles';
import { useProjectFormContext } from '../ProjectFormProvider';

export const SnowflakeSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    return (
        <Input
            name="warehouse.schema"
            label="Schema"
            documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#schema-2"
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

const SnowflakeForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.SNOWFLAKE;
    return (
        <>
            <Input
                name="warehouse.account"
                label="Account"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#account"
                rules={{
                    required: 'Required field',
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Account'),
                    },
                }}
                disabled={disabled}
            />
            <Input
                name="warehouse.user"
                label="User"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#user-2"
                rules={{
                    required: requireSecrets ? 'Required field' : undefined,
                }}
                placeholder={
                    disabled || !requireSecrets ? '**************' : undefined
                }
                disabled={disabled}
            />
            <PasswordInput
                name="warehouse.password"
                label="Password"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#password-2"
                rules={{
                    required: requireSecrets ? 'Required field' : undefined,
                }}
                placeholder={
                    disabled || !requireSecrets ? '**************' : undefined
                }
                disabled={disabled}
            />
            <Input
                name="warehouse.role"
                label="Role"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#role"
                rules={{
                    required: 'Required field',
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Role'),
                    },
                }}
                disabled={disabled}
            />
            <Input
                name="warehouse.database"
                label="Database"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#database"
                rules={{
                    required: 'Required field',
                    validate: {
                        isUppercase: isUppercase('Database'),
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Database'),
                    },
                }}
                disabled={disabled}
            />
            <Input
                name="warehouse.warehouse"
                label="Warehouse"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#warehouse"
                rules={{
                    required: 'Required field',
                    validate: {
                        isUppercase: isUppercase('Warehouse'),
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Warehouse'),
                    },
                }}
                disabled={disabled}
            />

            <FormSection isOpen={isOpen} name="advanced">
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
            <AdvancedButtonWrapper>
                <AdvancedButton
                    icon={isOpen ? 'chevron-up' : 'chevron-down'}
                    text={`Advanced configuration options`}
                    onClick={toggleOpen}
                />
            </AdvancedButtonWrapper>
        </>
    );
};

export default SnowflakeForm;
