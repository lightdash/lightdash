import { WarehouseTypes } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Button,
    CopyButton,
    Group,
    NumberInput,
    PasswordInput,
    Select,
    Stack,
    Switch,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import React, { FC } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { useToggle } from 'react-use';
import { hasNoWhiteSpaces } from '../../../utils/fieldValidators';
import MantineIcon from '../../common/MantineIcon';
import FormSection from '../../ReactHookForm/FormSection';
import FormCollapseButton from '../FormCollapseButton';
import { useProjectFormContext } from '../ProjectFormProvider';
import StartOfWeekSelect from './Inputs/StartOfWeekSelect';
import { useCreateSshKeyPair } from './sshHooks';

export const RedshiftSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const { register } = useFormContext();
    return (
        <TextInput
            label="Schema"
            description="This is the schema name."
            required
            {...register('warehouse.schema', {
                validate: {
                    hasNoWhiteSpaces: hasNoWhiteSpaces('Schema'),
                },
            })}
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
    const { setValue, register } = useFormContext();
    const showSshTunnelConfiguration: boolean = useWatch({
        name: 'warehouse.useSshTunnel',
        defaultValue:
            (savedProject?.warehouseConnection?.type ===
                WarehouseTypes.REDSHIFT &&
                savedProject.warehouseConnection.useSshTunnel) ||
            false,
    });
    const sshTunnelPublicKey: string = useWatch({
        name: 'warehouse.sshTunnelPublicKey',
        defaultValue:
            savedProject?.warehouseConnection?.type ===
                WarehouseTypes.REDSHIFT &&
            savedProject.warehouseConnection.sshTunnelPublicKey,
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
                    label="Host"
                    description="This is the host where the database is running."
                    required
                    {...register('warehouse.host', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces('Host'),
                        },
                    })}
                    disabled={disabled}
                    labelProps={{ style: { marginTop: '8px' } }}
                />
                <TextInput
                    label="User"
                    description="This is the database user name."
                    required={requireSecrets}
                    {...register('warehouse.user', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces('User'),
                        },
                    })}
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
                    placeholder={
                        disabled || !requireSecrets
                            ? '**************'
                            : undefined
                    }
                    {...register('warehouse.password')}
                    disabled={disabled}
                />
                <TextInput
                    label="DB name"
                    description="This is the database name."
                    required
                    {...register('warehouse.dbname', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces('DB name'),
                        },
                    })}
                    disabled={disabled}
                />
                <FormSection isOpen={isOpen} name="advanced">
                    <Stack style={{ marginTop: '8px' }}>
                        <Controller
                            name="warehouse.port"
                            defaultValue={5439}
                            render={({ field }) => (
                                <NumberInput
                                    {...field}
                                    label="Port"
                                    description="This is the port where the database is running."
                                    required
                                    disabled={disabled}
                                />
                            )}
                        />
                        <Controller
                            name="warehouse.keepalivesIdle"
                            defaultValue={0}
                            render={({ field }) => (
                                <NumberInput
                                    {...field}
                                    label="Keep alive idle (seconds)"
                                    description={
                                        <p>
                                            This specifies the amount of seconds
                                            with no network activity after which
                                            the operating system should send a
                                            TCP keepalive message to the client.
                                            You can see more details in{' '}
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
                            )}
                        />
                        <Controller
                            name="warehouse.sslmode"
                            defaultValue="prefer"
                            render={({ field }) => (
                                <Select
                                    name={field.name}
                                    label="SSL mode"
                                    description={
                                        <p>
                                            This controls how dbt connects to
                                            Redshift databases using SSL. You
                                            can see more details in{' '}
                                            <Anchor
                                                target="_blank"
                                                href="https://docs.getdbt.com/docs/core/connect-data-platform/redshift-setup#sslmode-change"
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
                                    value={field.value}
                                    onChange={field.onChange}
                                    disabled={disabled}
                                />
                            )}
                        />
                        <Controller
                            name="warehouse.ra3Node"
                            render={({ field }) => (
                                <Switch.Group
                                    label="Use RA3 node"
                                    description="Allow dbt to use cross-database-resources."
                                    value={field.value ? ['true'] : []}
                                    onChange={(values) =>
                                        field.onChange(values.length > 0)
                                    }
                                    size="md"
                                >
                                    <Group mt="xs">
                                        <Switch
                                            onLabel="Yes"
                                            offLabel="No"
                                            value="true"
                                            disabled={disabled}
                                        />
                                    </Group>
                                </Switch.Group>
                            )}
                        />
                        <StartOfWeekSelect disabled={disabled} />
                        <Controller
                            name="warehouse.useSshTunnel"
                            render={({ field }) => (
                                <Switch.Group
                                    label="Use SSH tunnel"
                                    value={field.value ? ['true'] : []}
                                    onChange={(values) =>
                                        field.onChange(values.length > 0)
                                    }
                                    size="md"
                                >
                                    <Group mt="xs">
                                        <Switch
                                            onLabel="Yes"
                                            offLabel="No"
                                            value="true"
                                            disabled={disabled}
                                        />
                                    </Group>
                                </Switch.Group>
                            )}
                        />
                        <FormSection
                            isOpen={showSshTunnelConfiguration}
                            name="ssh-config"
                        >
                            <Stack style={{ marginBottom: '8px' }}>
                                <TextInput
                                    label="SSH Remote Host"
                                    disabled={disabled}
                                    {...register('warehouse.sshTunnelHost')}
                                />
                                <Controller
                                    name="warehouse.sshTunnelPort"
                                    defaultValue={22}
                                    render={({ field }) => (
                                        <NumberInput
                                            {...field}
                                            label="SSH Remote Port"
                                            disabled={disabled}
                                        />
                                    )}
                                />
                                <TextInput
                                    label="SSH Username"
                                    disabled={disabled}
                                    {...register('warehouse.sshTunnelUser')}
                                />
                                {sshTunnelPublicKey && (
                                    <TextInput
                                        {...register(
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

export default RedshiftForm;
