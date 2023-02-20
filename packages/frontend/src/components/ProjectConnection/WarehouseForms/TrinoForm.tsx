import { WarehouseTypes } from '@lightdash/common';
import React, { FC } from 'react';
import { useToggle } from 'react-use';
import { hasNoWhiteSpaces } from '../../../utils/fieldValidators';
import FormSection from '../../ReactHookForm/FormSection';
import Input from '../../ReactHookForm/Input';
import NumericInput from '../../ReactHookForm/NumericInput';
import PasswordInput from '../../ReactHookForm/PasswordInput';
import Select from '../../ReactHookForm/Select';
import {
    AdvancedButton,
    AdvancedButtonWrapper,
} from '../ProjectConnection.styles';
import { useProjectFormContext } from '../ProjectFormProvider';
import StartOfWeekSelect from './Inputs/StartOfWeekSelect';

export const TrinoSchemaInput: FC<{
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

const TrinoForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.TRINO;
    return (
        <>
            <Input
                name="warehouse.host"
                label="Host"
                labelHelp="This is the host where the database is running."
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
                labelHelp="This is the database user name."
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
                name="warehouse.dbname"
                label="DB name"
                labelHelp="This is the database name."
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
                    labelHelp="This is the database name."
                    rules={{
                        required: 'Required field',
                    }}
                    disabled={disabled}
                    defaultValue={443}
                />
                <Select
                    name="warehouse.http_scheme"
                    label="SSL mode"
                    labelHelp={
                        <p>
                            This controls how dbt connects to Trino database
                            using SSL. You can see more details in
                            <a
                                target="_blank"
                                href="https://docs.getdbt.com/reference/warehouse-setups/trino-setup#configuration"
                                rel="noreferrer"
                            >
                                dbt documentation
                            </a>
                            .
                        </p>
                    }
                    options={['http', 'https'].map((x) => ({
                        value: x,
                        label: x,
                    }))}
                    defaultValue="https"
                    disabled={disabled}
                />
                <StartOfWeekSelect disabled={disabled} />
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

export default TrinoForm;
