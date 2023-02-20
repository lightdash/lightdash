import { WarehouseTypes } from '@lightdash/common';
import React, { FC } from 'react';
import { useToggle } from 'react-use';
import { hasNoWhiteSpaces } from '../../../utils/fieldValidators';
import BooleanSwitch from '../../ReactHookForm/BooleanSwitch';
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

export const RedshiftSchemaInput: FC<{
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

const RedshiftForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.REDSHIFT;
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
                    labelHelp="This is the port where the database is running."
                    rules={{
                        required: 'Required field',
                    }}
                    disabled={disabled}
                    defaultValue={5439}
                />
                <NumericInput
                    name="warehouse.keepalivesIdle"
                    label="Keep alive idle (seconds)"
                    labelHelp="This specifies the amount of seconds with no network activity after which the operating system should send a TCP keepalive message to the client."
                    rules={{
                        required: 'Required field',
                    }}
                    disabled={disabled}
                    defaultValue={0}
                />
                <Select
                    name="warehouse.sslmode"
                    label="SSL mode"
                    labelHelp="This controls how dbt connects to Postgres databases using SSL."
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
                <BooleanSwitch
                    name="warehouse.ra3Node"
                    label="Use RA3 node"
                    labelHelp="Allow dbt to use cross-database-resources."
                    defaultValue
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

export default RedshiftForm;
