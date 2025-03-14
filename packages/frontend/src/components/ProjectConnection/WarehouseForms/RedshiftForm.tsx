import { FeatureFlags, WarehouseTypes } from '@lightdash/common';
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
import { type FC } from 'react';
import { useToggle } from 'react-use';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import FormSection from '../../ReactHookForm/FormSection';
import MantineIcon from '../../common/MantineIcon';
import FormCollapseButton from '../FormCollapseButton';
import { useFormContext } from '../formContext';
import { useProjectFormContext } from '../useProjectFormContext';
import BooleanSwitch from './Inputs/BooleanSwitch';
import StartOfWeekSelect from './Inputs/StartOfWeekSelect';
import { useCreateSshKeyPair } from './sshHooks';

export const RedshiftSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const form = useFormContext();
    return (
        <TextInput
            label="Schema"
            description="This is the schema name."
            required
            {...form.getInputProps('warehouse.schema')}
            disabled={disabled}
        />
    );
};

const RedshiftForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const form = useFormContext();

    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.REDSHIFT;

    if (form.values.warehouse?.type !== WarehouseTypes.REDSHIFT) {
        throw new Error(
            'Redshift form is not available for this warehouse type',
        );
    }

    const showSshTunnelConfiguration: boolean =
        form.values.warehouse.useSshTunnel ??
        (savedProject?.warehouseConnection?.type === WarehouseTypes.REDSHIFT &&
            savedProject.warehouseConnection.useSshTunnel) ??
        false;

    const sshTunnelPublicKey: string | undefined =
        form.values.warehouse.sshTunnelPublicKey ??
        (savedProject?.warehouseConnection?.type === WarehouseTypes.REDSHIFT
            ? savedProject?.warehouseConnection?.sshTunnelPublicKey
            : undefined);

    const { mutate, isLoading } = useCreateSshKeyPair({
        onSuccess: (data) => {
            form.setFieldValue('warehouse.sshTunnelPublicKey', data.publicKey);
        },
    });

    const isPassthroughLoginFeatureEnabled = useFeatureFlagEnabled(
        FeatureFlags.PassthroughLogin,
    );

    const ra3NodeField = form.getInputProps('warehouse.ra3Node');
    const useSshTunnelField = form.getInputProps('warehouse.useSshTunnel');

    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <TextInput
                    name="warehouse.host"
                    label="Host"
                    description="This is the host where the database is running."
                    required
                    {...form.getInputProps('warehouse.host')}
                    disabled={disabled}
                    labelProps={{ style: { marginTop: '8px' } }}
                />
                <TextInput
                    name="warehouse.user"
                    label="User"
                    description="This is the database user name."
                    required={requireSecrets}
                    {...form.getInputProps('warehouse.user')}
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
                    required={requireSecrets}
                    placeholder={
                        disabled || !requireSecrets
                            ? '**************'
                            : undefined
                    }
                    {...form.getInputProps('warehouse.password')}
                    disabled={disabled}
                />
                <TextInput
                    name="warehouse.dbname"
                    label="DB name"
                    description="This is the database name."
                    required
                    {...form.getInputProps('warehouse.dbname')}
                    disabled={disabled}
                />
                <FormSection isOpen={isOpen} name="advanced">
                    <Stack style={{ marginTop: '8px' }}>
                        {isPassthroughLoginFeatureEnabled && (
                            <BooleanSwitch
                                name="warehouse.requireUserCredentials"
                                label="Require users to provide their own credentials"
                                defaultChecked={false}
                                disabled={disabled}
                                {...form.getInputProps(
                                    'warehouse.requireUserCredentials',
                                )}
                            />
                        )}

                        <NumberInput
                            name="warehouse.port"
                            defaultValue={5439}
                            {...form.getInputProps('warehouse.port')}
                            label="Port"
                            description="This is the port where the database is running."
                            required
                            disabled={disabled}
                        />

                        <NumberInput
                            name="warehouse.keepalivesIdle"
                            {...form.getInputProps('warehouse.keepalivesIdle')}
                            defaultValue={0}
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

                        <Select
                            name="warehouse.sslmode"
                            {...form.getInputProps('warehouse.sslmode')}
                            defaultValue="prefer"
                            label="SSL mode"
                            description={
                                <p>
                                    This controls how dbt connects to Redshift
                                    databases using SSL. You can see more
                                    details in{' '}
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
                            disabled={disabled}
                        />

                        <Switch.Group
                            label="Use RA3 node"
                            description="Allow dbt to use cross-database-resources."
                            value={ra3NodeField.value ? ['true'] : []}
                            onChange={(values) =>
                                ra3NodeField.onChange(values.length > 0)
                            }
                            size="md"
                        >
                            <Group mt="xs">
                                <Switch
                                    name="warehouse.ra3Node"
                                    onLabel="Yes"
                                    offLabel="No"
                                    value="true"
                                    disabled={disabled}
                                />
                            </Group>
                        </Switch.Group>

                        <StartOfWeekSelect disabled={disabled} />

                        <NumberInput
                            name="warehouse.timeoutSeconds"
                            {...form.getInputProps('warehouse.timeoutSeconds')}
                            defaultValue={300}
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

                        <Switch.Group
                            label="Use SSH tunnel"
                            value={useSshTunnelField.value ? ['true'] : []}
                            onChange={(values) =>
                                useSshTunnelField.onChange(values.length > 0)
                            }
                            size="md"
                        >
                            <Group mt="xs">
                                <Switch
                                    name="warehouse.useSshTunnel"
                                    onLabel="Yes"
                                    offLabel="No"
                                    value="true"
                                    disabled={disabled}
                                />
                            </Group>
                        </Switch.Group>

                        <FormSection
                            isOpen={showSshTunnelConfiguration}
                            name="ssh-config"
                        >
                            <Stack style={{ marginBottom: '8px' }}>
                                <TextInput
                                    name="warehouse.sshTunnelHost"
                                    label="SSH Remote Host"
                                    disabled={disabled}
                                    {...form.getInputProps(
                                        'warehouse.sshTunnelHost',
                                    )}
                                />

                                <NumberInput
                                    name="warehouse.sshTunnelPort"
                                    defaultValue={22}
                                    {...form.getInputProps(
                                        'warehouse.sshTunnelPort',
                                    )}
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

export default RedshiftForm;
