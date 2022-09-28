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
            labelHelp="This is the schema name."
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
                labelHelp="This is the account to connect to."
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
                labelHelp="This is the database user name."
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
                labelHelp="This is the database user password."
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
                labelHelp="This is the role to assume when running queries as the specified user."
                rules={{
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Role'),
                    },
                }}
                disabled={disabled}
            />
            <Input
                name="warehouse.database"
                label="Database"
                labelHelp="This is the database name."
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
                labelHelp="This is the warehouse name."
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
                    labelHelp={
                        <p>
                            This is intended to keep Snowflake sessions alive
                            beyond the typical 4 hour timeout limit You can see
                            more details in{' '}
                            <a
                                target="_blank"
                                href="https://docs.getdbt.com/reference/warehouse-profiles/snowflake-profile#client_session_keep_alive"
                                rel="noreferrer"
                            >
                                dbt documentation
                            </a>
                            .
                        </p>
                    }
                    disabled={disabled}
                    defaultValue={false}
                />
                <Input
                    name="warehouse.queryTag"
                    label="Query tag"
                    labelHelp={
                        <p>
                            This is Snowflake query tags parameter. You can see
                            more details in{' '}
                            <a
                                target="_blank"
                                href="https://docs.getdbt.com/reference/warehouse-profiles/snowflake-profile#query_tag"
                                rel="noreferrer"
                            >
                                dbt documentation
                            </a>
                            .
                        </p>
                    }
                    disabled={disabled}
                />
                <Input
                    name="warehouse.accessUrl"
                    label="Snowflake URL override"
                    labelHelp={
                        <p>
                            Usually Lightdash would connect to a default url:
                            account.snowflakecomputing.com. If you'd like to
                            override this (e.g. for the dbt server) you can
                            specify a full custom URL here.
                        </p>
                    }
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
