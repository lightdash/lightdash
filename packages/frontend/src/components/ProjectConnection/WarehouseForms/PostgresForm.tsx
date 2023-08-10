import { WarehouseTypes } from '@lightdash/common';
import {
    Accordion,
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
import React, { FC } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useToggle } from 'react-use';
import MantineIcon from '../../common/MantineIcon';
import BooleanSwitch from '../../ReactHookForm/BooleanSwitch';
import FormSection from '../../ReactHookForm/FormSection';
import { useProjectFormContext } from '../ProjectFormProvider';
import StartOfWeekSelect from './Inputs/StartOfWeekSelect';
import { useCreateSshKeyPair } from './sshHooks';

export const PostgresSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    return (
        <TextInput
            name="warehouse.schema"
            label="Schema"
            description="This is the schema name."
            required
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
            <Stack style={{ marginTop: '8px' }}>
                <TextInput
                    name="warehouse.host"
                    label="Host"
                    description="This is the host where the database is running"
                    required
                    disabled={disabled}
                    defaultValue="localhost"
                    labelProps={{ style: { marginTop: '8px' } }}
                />

                <TextInput
                    name="warehouse.user"
                    label="User"
                    description="This is the database user name."
                    placeholder={
                        disabled || !requireSecrets
                            ? '**************'
                            : undefined
                    }
                    disabled={disabled}
                />
                <PasswordInput
                    name="warehouse.password"
                    label="Password"
                    description="This is the database user password."
                    placeholder={
                        disabled || !requireSecrets
                            ? '**************'
                            : undefined
                    }
                    disabled={disabled}
                />
                <TextInput
                    name="warehouse.dbname"
                    label="DB name"
                    description="This is the database name."
                    required
                    disabled={disabled}
                    defaultValue="postgres"
                />

                <FormSection isOpen={isOpen} name="advanced">
                    <Stack style={{ marginTop: '8px' }}>
                        <NumberInput
                            name="warehouse.port"
                            label="Port"
                            description="This is the port where the database is running."
                            required
                            disabled={disabled}
                            defaultValue={5432}
                        />
                        <NumberInput
                            name="warehouse.keepalivesIdle"
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
                            defaultValue={0}
                        />
                        <TextInput
                            name="warehouse.searchPath"
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
                            defaultValue="prefer"
                            disabled={disabled}
                        />
                        <TextInput
                            name="warehouse.role"
                            label="Role"
                            disabled={disabled}
                        />
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
                            <Stack style={{ marginBottom: '8px' }}>
                                <TextInput
                                    name="warehouse.sshTunnelHost"
                                    label="SSH Remote Host"
                                    disabled={disabled}
                                />
                                <NumberInput
                                    name="warehouse.sshTunnelPort"
                                    label="SSH Remote Port"
                                    disabled={disabled}
                                    defaultValue={22}
                                />
                                <TextInput
                                    name="warehouse.sshTunnelUser"
                                    label="SSH Username"
                                    disabled={disabled}
                                />
                                {sshTunnelPublicKey && (
                                    <TextInput
                                        name="warehouse.sshTunnelPublicKey"
                                        label="Generated SSH Public Key"
                                        readOnly={true}
                                        disabled={disabled}
                                        value={sshTunnelPublicKey}
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

                <Accordion
                    chevronPosition="left"
                    variant="filled"
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                    }}
                >
                    <Accordion.Item value="advanced configuration options">
                        <Accordion.Control
                            onClick={toggleOpen}
                            style={{
                                fontSize: '14px',
                                paddingRight: '2px',
                                textDecoration: 'none',
                            }}
                        >
                            Advanced configuration options
                        </Accordion.Control>
                    </Accordion.Item>
                </Accordion>
            </Stack>
        </>
    );
};

export default PostgresForm;
