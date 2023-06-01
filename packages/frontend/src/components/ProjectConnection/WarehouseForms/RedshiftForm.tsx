import { Button, FormGroup, Intent, Switch, TextArea } from '@blueprintjs/core';
import { WarehouseTypes } from '@lightdash/common';
import React, { FC } from 'react';
import { useToggle } from 'react-use';
import { hasNoWhiteSpaces } from '../../../utils/fieldValidators';
import BooleanSwitch from '../../ReactHookForm/BooleanSwitch';
import FormSection from '../../ReactHookForm/FormSection';
import Input from '../../ReactHookForm/Input';
import InputWrapper from '../../ReactHookForm/InputWrapper';
import NumericInput from '../../ReactHookForm/NumericInput';
import PasswordInput from '../../ReactHookForm/PasswordInput';
import Select from '../../ReactHookForm/Select';
import {
    AdvancedButton,
    AdvancedButtonWrapper,
} from '../ProjectConnection.styles';
import { useProjectFormContext } from '../ProjectFormProvider';
import StartOfWeekSelect from './Inputs/StartOfWeekSelect';
import { useCreateSshKeyPair } from './sshHooks';

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
    useCreateSshKeyPair({ onSuccess: () => {} });

    const [useSSHTunnel, setUseSSHTunnel] = React.useState(false);
    const [SSHKeyGenerated, setSSHKeyGenerated] = React.useState(false);
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
                <FormGroup
                    labelFor="warehouse.useSshTunnel"
                    label="Use SSH tunnel"
                    inline
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 'none',
                        fontWeight: 500,
                    }}
                >
                    <Switch
                        alignIndicator="right"
                        checked={useSSHTunnel}
                        onChange={() => {
                            setUseSSHTunnel(!useSSHTunnel);
                        }}
                    />
                </FormGroup>
                <FormSection name="sshFormSection" isOpen={useSSHTunnel}>
                    <Input
                        name="warehouse.sshTunnelHost"
                        label="SSH host name for remote server"
                        labelHelp="This is the hostname or IP address for the remote server that you want to connect to. Lightdash will connect to this server via SSH before attempting to connect to your warehouse."
                        rules={{
                            required: 'Required field',
                            validate: {
                                hasNoWhiteSpaces: hasNoWhiteSpaces('SSHhost'),
                            },
                        }}
                        disabled={disabled}
                    />
                    <NumericInput
                        name="warehouse.sshTunnelPort"
                        label="SSH port"
                        labelHelp="The port on the remote server that you want to connect to."
                        rules={{
                            required: 'Required field',
                        }}
                        disabled={disabled}
                        defaultValue={22}
                    />
                    <Input
                        name="warehouse.sshTunnelUser"
                        label="SSH user name"
                        labelHelp="This is the username Lightdash will use when it connects to your remote server over SSH"
                        rules={{
                            required: requireSecrets
                                ? 'Required field'
                                : undefined,
                            validate: {
                                hasNoWhiteSpaces: hasNoWhiteSpaces('SSHuser'),
                            },
                        }}
                        placeholder={
                            disabled || !requireSecrets
                                ? '**************'
                                : undefined
                        }
                        disabled={disabled}
                    />
                    <InputWrapper
                        label="SSH public key"
                        name="warehouse.SSHpublicKey"
                        render={() => (
                            <>
                                {SSHKeyGenerated ? (
                                    <TextArea
                                        readOnly
                                        fill
                                        value="I'm a generated SSH Public Key! Copy me"
                                    />
                                ) : (
                                    <></>
                                )}
                                <Button
                                    intent={Intent.PRIMARY}
                                    onClick={() => setSSHKeyGenerated(true)}
                                    icon={SSHKeyGenerated ? 'refresh' : 'key'}
                                    style={{ marginTop: '10px' }}
                                >
                                    {SSHKeyGenerated
                                        ? 'Regenerate key'
                                        : 'Generate key'}
                                </Button>
                            </>
                        )}
                    />
                </FormSection>
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
