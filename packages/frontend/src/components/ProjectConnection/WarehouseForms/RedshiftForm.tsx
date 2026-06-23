import {
    FeatureFlags,
    RedshiftAuthenticationType,
    WarehouseTypes,
} from '@lightdash/common';
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
import { useEffect, type FC } from 'react';
import { useToggle } from 'react-use';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import MantineIcon from '../../common/MantineIcon';
import FormCollapseButton from '../FormCollapseButton';
import { useFormContext } from '../formContext';
import BooleanSwitch from '../Inputs/BooleanSwitch';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';
import { useProjectFormContext } from '../useProjectFormContext';
import DataTimezoneField from './DataTimezoneField';
import { RedshiftDefaultValues } from './defaultValues';
import { useCreateSshKeyPair } from './sshHooks';

export const RedshiftSchemaInput: FC<{
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

const RedshiftForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const form = useFormContext();
    const redshiftIamAuthFlag = useServerFeatureFlag(
        FeatureFlags.RedshiftIamAuth,
    );

    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.REDSHIFT;

    if (form.values.warehouse?.type !== WarehouseTypes.REDSHIFT) {
        throw new Error(
            'Redshift form is not available for this warehouse type',
        );
    }

    const warehouse = form.values.warehouse;

    // The flag resolves asynchronously; until it does, don't touch the
    // authentication type or we'd clobber a saved IAM connection back to
    // password before the flag loads.
    const isIamAuthFlagResolved = redshiftIamAuthFlag.isFetched;
    const isIamAuthEnabled = redshiftIamAuthFlag.data?.enabled === true;

    const savedAuthenticationType =
        savedProject?.warehouseConnection?.type === WarehouseTypes.REDSHIFT
            ? savedProject.warehouseConnection.authenticationType
            : undefined;

    const defaultAuthenticationType =
        savedAuthenticationType ?? RedshiftAuthenticationType.PASSWORD;

    useEffect(() => {
        if (!isIamAuthFlagResolved) {
            return;
        }
        const currentType = warehouse.authenticationType;
        const nextType = isIamAuthEnabled
            ? defaultAuthenticationType
            : RedshiftAuthenticationType.PASSWORD;

        if (
            currentType === undefined ||
            (!isIamAuthEnabled &&
                currentType !== RedshiftAuthenticationType.PASSWORD)
        ) {
            form.setFieldValue('warehouse.authenticationType', nextType);
        }
    }, [
        defaultAuthenticationType,
        form,
        warehouse.authenticationType,
        isIamAuthEnabled,
        isIamAuthFlagResolved,
    ]);

    const authenticationType = isIamAuthEnabled
        ? (warehouse.authenticationType ?? defaultAuthenticationType)
        : RedshiftAuthenticationType.PASSWORD;

    const isPasswordAuthentication =
        authenticationType === RedshiftAuthenticationType.PASSWORD;
    const isIamAuthentication =
        authenticationType === RedshiftAuthenticationType.IAM;
    const isServerless = warehouse.isServerless ?? false;

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
                {isIamAuthEnabled && (
                    <Select
                        name="warehouse.authenticationType"
                        label="Authentication type"
                        description="Choose whether to authenticate with a database username and password, or with AWS IAM (temporary credentials)."
                        data={[
                            {
                                value: RedshiftAuthenticationType.PASSWORD,
                                label: 'Username & password',
                            },
                            {
                                value: RedshiftAuthenticationType.IAM,
                                label: 'AWS IAM',
                            },
                        ]}
                        defaultValue={defaultAuthenticationType}
                        {...form.getInputProps('warehouse.authenticationType')}
                        required
                        disabled={disabled}
                    />
                )}
                {isPasswordAuthentication && (
                    <>
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
                    </>
                )}
                {isIamAuthentication && (
                    <>
                        <TextInput
                            name="warehouse.region"
                            label="AWS region"
                            description="The AWS region where your Redshift cluster or serverless workgroup is located."
                            required
                            placeholder="us-east-1"
                            {...form.getInputProps('warehouse.region')}
                            disabled={disabled}
                        />
                        <BooleanSwitch
                            name="warehouse.isServerless"
                            label="Redshift Serverless"
                            description="Enable if connecting to a Redshift Serverless workgroup rather than a provisioned cluster."
                            {...form.getInputProps('warehouse.isServerless', {
                                type: 'checkbox',
                            })}
                            disabled={disabled}
                        />
                        {isServerless ? (
                            <TextInput
                                name="warehouse.workgroupName"
                                label="Workgroup name"
                                description="The name of your Redshift Serverless workgroup."
                                required
                                {...form.getInputProps(
                                    'warehouse.workgroupName',
                                )}
                                disabled={disabled}
                            />
                        ) : (
                            <TextInput
                                name="warehouse.clusterIdentifier"
                                label="Cluster identifier"
                                description="The identifier of your provisioned Redshift cluster."
                                required
                                {...form.getInputProps(
                                    'warehouse.clusterIdentifier',
                                )}
                                disabled={disabled}
                            />
                        )}
                        <TextInput
                            name="warehouse.user"
                            label="Database user"
                            description="The Redshift database user to request temporary credentials for."
                            required={!isServerless}
                            {...form.getInputProps('warehouse.user')}
                            disabled={disabled}
                        />
                        <TextInput
                            name="warehouse.assumeRoleArn"
                            label="Assume role ARN"
                            description="Recommended: an IAM role Lightdash assumes to mint Redshift credentials. Leave blank to use the host's IAM role (self-hosted), or provide AWS access keys under Advanced."
                            placeholder="arn:aws:iam::123456789012:role/my-redshift-role"
                            {...form.getInputProps('warehouse.assumeRoleArn')}
                            disabled={disabled}
                        />
                        <TextInput
                            name="warehouse.assumeRoleExternalId"
                            label="Assume role external ID"
                            description="External ID required by the assume-role trust policy, if configured."
                            {...form.getInputProps(
                                'warehouse.assumeRoleExternalId',
                            )}
                            disabled={disabled}
                        />
                    </>
                )}
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
                        <BooleanSwitch
                            name="warehouse.requireUserCredentials"
                            label="Require users to provide their own credentials"
                            {...form.getInputProps(
                                'warehouse.requireUserCredentials',
                                { type: 'checkbox' },
                            )}
                            defaultChecked={
                                RedshiftDefaultValues.requireUserCredentials
                            }
                            disabled={disabled}
                        />

                        {isIamAuthentication && (
                            <>
                                <TextInput
                                    name="warehouse.accessKeyId"
                                    label="AWS access key ID"
                                    description="Advanced: static IAM user access key, only if you are not using an assume-role ARN or the host's IAM role. Long-lived secret — prefer assume-role where possible."
                                    placeholder={
                                        disabled || !requireSecrets
                                            ? '**************'
                                            : undefined
                                    }
                                    {...form.getInputProps(
                                        'warehouse.accessKeyId',
                                    )}
                                    disabled={disabled}
                                />
                                <PasswordInput
                                    name="warehouse.secretAccessKey"
                                    label="AWS secret access key"
                                    description="Secret access key paired with the access key ID above."
                                    placeholder={
                                        disabled || !requireSecrets
                                            ? '**************'
                                            : undefined
                                    }
                                    {...form.getInputProps(
                                        'warehouse.secretAccessKey',
                                    )}
                                    disabled={disabled}
                                />
                                {!isServerless && (
                                    <BooleanSwitch
                                        name="warehouse.autoCreate"
                                        label="Auto-create database user"
                                        description="Create the database user automatically if it does not already exist (GetClusterCredentials AutoCreate)."
                                        {...form.getInputProps(
                                            'warehouse.autoCreate',
                                            { type: 'checkbox' },
                                        )}
                                        disabled={disabled}
                                    />
                                )}
                            </>
                        )}

                        <NumberInput
                            name="warehouse.port"
                            defaultValue={RedshiftDefaultValues.port}
                            {...form.getInputProps('warehouse.port')}
                            label="Port"
                            description="This is the port where the database is running."
                            required
                            disabled={disabled}
                        />

                        <NumberInput
                            name="warehouse.keepalivesIdle"
                            {...form.getInputProps('warehouse.keepalivesIdle')}
                            defaultValue={RedshiftDefaultValues.keepalivesIdle}
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
                            defaultValue={RedshiftDefaultValues.sslmode}
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

                        <BooleanSwitch
                            name="warehouse.ra3Node"
                            label="Use RA3 node"
                            description="Allow dbt to use cross-database-resources."
                            {...form.getInputProps('warehouse.ra3Node', {
                                type: 'checkbox',
                            })}
                            onLabel="Yes"
                            offLabel="No"
                        />

                        <DataTimezoneField disabled={disabled} />
                        <StartOfWeekSelect disabled={disabled} />

                        <NumberInput
                            name="warehouse.timeoutSeconds"
                            {...form.getInputProps('warehouse.timeoutSeconds')}
                            defaultValue={RedshiftDefaultValues.timeoutSeconds}
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
                            label="Use SSH tunnel"
                            description="Use SSH tunnel to connect to the database."
                            {...form.getInputProps('warehouse.useSshTunnel', {
                                type: 'checkbox',
                            })}
                            onLabel="Yes"
                            offLabel="No"
                            defaultChecked={RedshiftDefaultValues.useSshTunnel}
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
