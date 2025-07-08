import { WarehouseTypes } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Button,
    CopyButton,
    NumberInput,
    PasswordInput,
    Select,
    Stack,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import React, { type FC } from 'react';
import { useToggle } from 'react-use';
import MantineIcon from '../../common/MantineIcon';
import FormCollapseButton from '../FormCollapseButton';
import BooleanSwitch from '../Inputs/BooleanSwitch';
import CertificateFileInput from '../Inputs/CertificateFileInput';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';
import { useFormContext } from '../formContext';
import { useProjectFormContext } from '../useProjectFormContext';
import { PostgresDefaultValues } from './defaultValues';
import { useCreateSshKeyPair } from './sshHooks';

export const PostgresSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const form = useFormContext();

    return (
        <TextInput
            name="warehouse.schema"
            label="Schema"
            description="This is the schema name."
            required
            {...form.getInputProps('warehouse.schema')}
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
    const form = useFormContext();

    if (form.values.warehouse?.type !== WarehouseTypes.POSTGRES) {
        throw new Error('This form is only available for Postgres');
    }

    const defaultSshTunnelConfiguration: boolean =
        (savedProject?.warehouseConnection?.type === WarehouseTypes.POSTGRES &&
            savedProject?.warehouseConnection?.useSshTunnel) ||
        false;
    const showSshTunnelConfiguration: boolean =
        form.values.warehouse.useSshTunnel ?? defaultSshTunnelConfiguration;

    const sshTunnelPublicKey: string | undefined =
        form.values.warehouse.sshTunnelPublicKey ??
        (savedProject?.warehouseConnection?.type === WarehouseTypes.POSTGRES
            ? savedProject?.warehouseConnection?.sshTunnelPublicKey
            : undefined);

    const sslMode: string | undefined =
        form.values.warehouse.sslmode ??
        (savedProject?.warehouseConnection?.type === WarehouseTypes.POSTGRES
            ? savedProject?.warehouseConnection?.sslmode
            : undefined);

    const { mutate, isLoading } = useCreateSshKeyPair({
        onSuccess: (data) => {
            form.setFieldValue('warehouse.sshTunnelPublicKey', data.publicKey);
        },
    });

    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <TextInput
                    label="Host"
                    description="This is the host where the database is running."
                    required
                    name="warehouse.host"
                    {...form.getInputProps('warehouse.host')}
                    disabled={disabled}
                    labelProps={{ style: { marginTop: '8px' } }}
                />
                <TextInput
                    label="User"
                    description="This is the database user name."
                    required={requireSecrets}
                    name="warehouse.user"
                    {...form.getInputProps('warehouse.user')}
                    placeholder={
                        disabled || !requireSecrets
                            ? '**************'
                            : undefined
                    }
                    disabled={disabled}
                />
                <PasswordInput
                    label="Password"
                    description="This is the database user password."
                    required={requireSecrets}
                    name="warehouse.password"
                    placeholder={
                        disabled || !requireSecrets
                            ? '**************'
                            : undefined
                    }
                    {...form.getInputProps('warehouse.password')}
                    disabled={disabled}
                />
                <TextInput
                    label="DB name"
                    description="This is the database name."
                    required
                    name="warehouse.dbname"
                    {...form.getInputProps('warehouse.dbname')}
                    disabled={disabled}
                />
                <FormSection isOpen={isOpen} name="advanced">
                    <Stack style={{ marginTop: '8px' }}>
                        <BooleanSwitch
                            name="warehouse.requireUserCredentials"
                            {...form.getInputProps(
                                'warehouse.requireUserCredentials',
                                {
                                    type: 'checkbox',
                                },
                            )}
                            label="Require users to provide their own credentials"
                            disabled={disabled}
                            defaultChecked={
                                PostgresDefaultValues.requireUserCredentials
                            }
                        />
                        <NumberInput
                            name="warehouse.port"
                            {...form.getInputProps('warehouse.port')}
                            defaultValue={PostgresDefaultValues.port}
                            label="Port"
                            description="This is the port where the database is running."
                            required
                            disabled={disabled}
                        />

                        <NumberInput
                            name="warehouse.keepalivesIdle"
                            {...form.getInputProps('warehouse.keepalivesIdle')}
                            defaultValue={PostgresDefaultValues.keepalivesIdle}
                            label="Keep alive idle (seconds)"
                            description={
                                <p>
                                    This specifies the amount of seconds with no
                                    network activity after which the operating
                                    system should send a TCP keepalive message
                                    to the client. You can see more details in{' '}
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
                            required
                            disabled={disabled}
                        />

                        <TextInput
                            name="warehouse.searchPath"
                            {...form.getInputProps('warehouse.searchPath')}
                            label="Search path"
                            description={
                                <p>
                                    This controls the Postgres "search path".
                                    You can see more details in{' '}
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
                            {...form.getInputProps('warehouse.sslmode')}
                            defaultValue={PostgresDefaultValues.sslmode}
                            label="SSL mode"
                            description={
                                <p>
                                    This controls how dbt connects to Postgres
                                    databases using SSL. You can see more
                                    details in{' '}
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
                            data={[
                                'disable',
                                'no-verify',
                                'allow',
                                'prefer',
                                'require',
                                'verify-ca',
                                'verify-full',
                            ].map((x) => ({ value: x, label: x }))}
                            disabled={disabled}
                        />
                        {sslMode === 'verify-ca' ||
                        sslMode === 'verify-full' ? (
                            <>
                                <CertificateFileInput
                                    name={'warehouse.sslcert'}
                                    fileNameProperty={
                                        'warehouse.sslcertFileName'
                                    }
                                    label={'SSL certificate'}
                                    disabled={disabled}
                                    accept=".crt,.pem"
                                    description={
                                        <p>
                                            The client certificate used to
                                            authenticate your connection to the
                                            database.
                                        </p>
                                    }
                                />
                                <CertificateFileInput
                                    name={'warehouse.sslkey'}
                                    fileNameProperty={
                                        'warehouse.sslkeyFileName'
                                    }
                                    label={'SSL private key'}
                                    disabled={disabled}
                                    accept=".key,.pem"
                                    description={
                                        <p>
                                            The private key associated with your
                                            certificate, required for secure
                                            authentication.
                                        </p>
                                    }
                                />
                                <CertificateFileInput
                                    name={'warehouse.sslrootcert'}
                                    fileNameProperty={
                                        'warehouse.sslrootcertFileName'
                                    }
                                    label={'SSL root certificate'}
                                    disabled={disabled}
                                    accept=".crt,.pem"
                                    description={
                                        <p>
                                            The trusted certificate authority
                                            (CA) certificate used to verify the
                                            database server’s identity.
                                        </p>
                                    }
                                />
                            </>
                        ) : null}

                        <TextInput
                            name="warehouse.role"
                            label="Role"
                            disabled={disabled}
                            {...form.getInputProps('warehouse.role')}
                        />

                        <StartOfWeekSelect disabled={disabled} />

                        <NumberInput
                            name="warehouse.timeoutSeconds"
                            defaultValue={PostgresDefaultValues.timeoutSeconds}
                            {...form.getInputProps('warehouse.timeoutSeconds')}
                            label="Timeout in seconds"
                            description={
                                <p>
                                    If a query takes longer than this timeout to
                                    complete, then the query will be cancelled.
                                </p>
                            }
                            required
                            disabled={disabled}
                        />

                        <BooleanSwitch
                            name="warehouse.useSshTunnel"
                            {...form.getInputProps('warehouse.useSshTunnel', {
                                type: 'checkbox',
                            })}
                            label="Use SSH tunnel"
                            disabled={disabled}
                        />

                        <FormSection
                            isOpen={showSshTunnelConfiguration}
                            name="ssh-config"
                        >
                            <Stack style={{ marginBottom: '8px' }}>
                                <TextInput
                                    label="SSH Remote Host"
                                    disabled={disabled}
                                    name="warehouse.sshTunnelHost"
                                    {...form.getInputProps(
                                        'warehouse.sshTunnelHost',
                                    )}
                                />

                                <NumberInput
                                    name="warehouse.sshTunnelPort"
                                    {...form.getInputProps(
                                        'warehouse.sshTunnelPort',
                                    )}
                                    defaultValue={
                                        PostgresDefaultValues.sshTunnelPort
                                    }
                                    label="SSH Remote Port"
                                    disabled={disabled}
                                />

                                <TextInput
                                    name="warehouse.sshTunnelUser"
                                    label="SSH Username"
                                    disabled={disabled}
                                    {...form.getInputProps(
                                        'warehouse.sshTunnelUser',
                                    )}
                                />

                                {sshTunnelPublicKey && (
                                    <TextInput
                                        name="warehouse.sshTunnelPublicKey"
                                        {...form.getInputProps(
                                            'warehouse.sshTunnelPublicKey',
                                        )}
                                        label="Generated SSH Public Key"
                                        readOnly={true}
                                        disabled={disabled}
                                        rightSection={
                                            <>
                                                <CopyButton
                                                    value={sshTunnelPublicKey}
                                                >
                                                    {({ copied, copy }) => (
                                                        <Tooltip
                                                            label={
                                                                copied
                                                                    ? 'Copied'
                                                                    : 'Copy'
                                                            }
                                                            withArrow
                                                            position="right"
                                                        >
                                                            <ActionIcon
                                                                color={
                                                                    copied
                                                                        ? 'teal'
                                                                        : 'gray'
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
                                    onClick={() => mutate()}
                                    loading={isLoading}
                                    disabled={disabled || isLoading}
                                >
                                    {sshTunnelPublicKey
                                        ? 'Regenerate key'
                                        : 'Generate public key'}
                                </Button>
                            </Stack>
                        </FormSection>
                    </Stack>
                </FormSection>
                <FormCollapseButton isSectionOpen={isOpen} onClick={toggleOpen}>
                    Advanced configuration options
                </FormCollapseButton>
            </Stack>
        </>
    );
};

export default PostgresForm;
