import { Button } from '@blueprintjs/core';
import { WarehouseTypes } from '@lightdash/common';
import { ActionIcon, Anchor, CopyButton, Tooltip } from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import React, { FC } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useToggle } from 'react-use';
import { hasNoWhiteSpaces } from '../../../utils/fieldValidators';
import MantineIcon from '../../common/MantineIcon';
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
import { useCreateSshKeyPair } from './sshHooks';

export const PostgresSchemaInput: FC<{
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

const PostgresForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.POSTGRES;
    const { setValue } = useFormContext();
    const showSshTunnelConfiguration: boolean = useWatch({
        name: 'warehouse.useSshTunnel',
        defaultValue:
            (savedProject?.warehouseConnection?.type ===
                WarehouseTypes.POSTGRES &&
                savedProject?.warehouseConnection?.useSshTunnel) ||
            false,
    });
    const sshTunnelPublicKey: string = useWatch({
        name: 'warehouse.sshTunnelPublicKey',
        defaultValue:
            savedProject?.warehouseConnection?.type ===
                WarehouseTypes.POSTGRES &&
            savedProject?.warehouseConnection?.sshTunnelPublicKey,
    });
    const { mutate, isLoading } = useCreateSshKeyPair({
        onSuccess: (data) => {
            setValue('warehouse.sshTunnelPublicKey', data.publicKey);
        },
    });
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
                autoComplete="new-password"
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
                    defaultValue={5432}
                />
                <NumericInput
                    name="warehouse.keepalivesIdle"
                    label="Keep alive idle (seconds)"
                    labelHelp={
                        <p>
                            This specifies the amount of seconds with no network
                            activity after which the operating system should
                            send a TCP keepalive message to the client. You can
                            see more details in{' '}
                            <Anchor
                                target="_blank"
                                href="https://postgresqlco.nf/doc/en/param/tcp_keepalives_idle/"
                                rel="noreferrer"
                            >
                                postgresqlco documentation
                            </Anchor>
                            .
                        </p>
                    }
                    rules={{
                        required: 'Required field',
                    }}
                    disabled={disabled}
                    defaultValue={0}
                />
                <Input
                    name="warehouse.searchPath"
                    label="Search path"
                    labelHelp={
                        <p>
                            This controls the Postgres "search path". You can
                            see more details in{' '}
                            <Anchor
                                target="_blank"
                                href="https://docs.getdbt.com/reference/warehouse-profiles/postgres-profile#search_path"
                                rel="noreferrer"
                            >
                                dbt documentation
                            </Anchor>
                            .
                        </p>
                    }
                    disabled={disabled}
                />
                <Select
                    name="warehouse.sslmode"
                    label="SSL mode"
                    labelHelp={
                        <p>
                            This controls how dbt connects to Postgres databases
                            using SSL. You can see more details in
                            <Anchor
                                target="_blank"
                                href="https://docs.getdbt.com/reference/warehouse-profiles/postgres-profile#sslmode"
                                rel="noreferrer"
                            >
                                dbt documentation
                            </Anchor>
                            .
                        </p>
                    }
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
                <StartOfWeekSelect disabled={disabled} />
                <BooleanSwitch
                    name="warehouse.useSshTunnel"
                    label="Use SSH tunnel"
                    disabled={disabled}
                />
                <FormSection
                    isOpen={showSshTunnelConfiguration}
                    name="ssh-config"
                >
                    <Input
                        name="warehouse.sshTunnelHost"
                        label="SSH Remote Host"
                        disabled={disabled}
                    />
                    <NumericInput
                        name="warehouse.sshTunnelPort"
                        label="SSH Remote Port"
                        disabled={disabled}
                        defaultValue={22}
                    />
                    <Input
                        name="warehouse.sshTunnelUser"
                        label="SSH Username"
                        disabled={disabled}
                    />
                    {sshTunnelPublicKey && (
                        <Input
                            name="warehouse.sshTunnelPublicKey"
                            label="Generated SSH Public Key"
                            readOnly={true}
                            disabled={disabled}
                            rightElement={
                                <>
                                    <CopyButton value={sshTunnelPublicKey}>
                                        {({ copied, copy }) => (
                                            <Tooltip
                                                label={
                                                    copied ? 'Copied' : 'Copy'
                                                }
                                                withArrow
                                                position="right"
                                            >
                                                <ActionIcon
                                                    color={
                                                        copied ? 'teal' : 'gray'
                                                    }
                                                    onClick={copy}
                                                >
                                                    <MantineIcon
                                                        icon={
                                                            copied
                                                                ? IconCheck
                                                                : IconCopy
                                                        }
                                                    />
                                                </ActionIcon>
                                            </Tooltip>
                                        )}
                                    </CopyButton>
                                </>
                            }
                        />
                    )}
                    <Button
                        text={
                            sshTunnelPublicKey
                                ? `Regenerate key`
                                : `Generate public key`
                        }
                        onClick={() => mutate()}
                        loading={isLoading}
                        disabled={disabled || isLoading}
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

export default PostgresForm;
