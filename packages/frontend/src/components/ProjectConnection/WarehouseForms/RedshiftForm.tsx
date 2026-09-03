import { RedshiftAuthenticationType, WarehouseTypes } from '@lightdash/common';
import {
    TextInput,
    Stack,
    Button,
    Anchor,
    Select,
    PasswordInput,
} from '@mantine/core';
import { useEffect, type FC, type ReactNode } from 'react';
import { useToggle } from 'react-use';
import { CopyActionIcon } from '../../common/CopyActionIcon';
import { NumberInput } from '../../common/NumberInput';
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
    description?: ReactNode;
}> = ({ disabled, description }) => {
    const form = useFormContext();
    return (
        <TextInput
            name="warehouse.schema"
            label="Schema"
            description={description ?? 'This is the schema name.'}
            required
            {...form.getInputProps('warehouse.schema')}
            disabled={disabled}
        />
    );
};

const RedshiftAwsSsoFields: FC<{
    disabled: boolean;
    required?: boolean;
}> = ({ disabled, required = false }) => {
    const form = useFormContext();

    return (
        <>
            <TextInput
                name="warehouse.awsSsoStartUrl"
                label="AWS access portal URL"
                description="The IAM Identity Center access portal URL users will open to sign in."
                placeholder="https://your-start-url.awsapps.com/start"
                required={required}
                {...form.getInputProps('warehouse.awsSsoStartUrl')}
                disabled={disabled}
            />
            <TextInput
                name="warehouse.awsSsoRegion"
                label="IAM Identity Center region"
                description="The AWS region where IAM Identity Center is configured."
                placeholder="us-east-1"
                required={required}
                {...form.getInputProps('warehouse.awsSsoRegion')}
                disabled={disabled}
            />
            <TextInput
                name="warehouse.awsSsoAccountId"
                label="AWS account ID"
                description="The AWS account users should access through IAM Identity Center."
                placeholder="123456789012"
                required={required}
                {...form.getInputProps('warehouse.awsSsoAccountId')}
                disabled={disabled}
            />
            <TextInput
                name="warehouse.awsSsoRoleName"
                label="AWS role name"
                description="The IAM Identity Center role or permission-set role assigned to users."
                placeholder="AWSReservedSSO_Redshift"
                required={required}
                {...form.getInputProps('warehouse.awsSsoRoleName')}
                disabled={disabled}
            />
        </>
    );
};

const RedshiftIamFields: FC<{
    disabled: boolean;
    isServerless: boolean;
}> = ({ disabled, isServerless }) => {
    const form = useFormContext();

    return (
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
                    {...form.getInputProps('warehouse.workgroupName')}
                    disabled={disabled}
                />
            ) : (
                <TextInput
                    name="warehouse.clusterIdentifier"
                    label="Cluster identifier"
                    description="The identifier of your provisioned Redshift cluster."
                    required
                    {...form.getInputProps('warehouse.clusterIdentifier')}
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
                {...form.getInputProps('warehouse.assumeRoleExternalId')}
                disabled={disabled}
            />
        </>
    );
};

const RedshiftIamAdvancedFields: FC<{
    disabled: boolean;
    isServerless: boolean;
    requireSecrets: boolean;
}> = ({ disabled, isServerless, requireSecrets }) => {
    const form = useFormContext();

    return (
        <>
            <TextInput
                name="warehouse.accessKeyId"
                label="AWS access key ID"
                description="Advanced: static IAM user access key, only if you are not using an assume-role ARN or the host's IAM role. Long-lived secret — prefer assume-role where possible."
                placeholder={
                    disabled || !requireSecrets ? '**************' : undefined
                }
                {...form.getInputProps('warehouse.accessKeyId')}
                disabled={disabled}
            />
            <PasswordInput
                name="warehouse.secretAccessKey"
                label="AWS secret access key"
                description="Secret access key paired with the access key ID above."
                placeholder={
                    disabled || !requireSecrets ? '**************' : undefined
                }
                {...form.getInputProps('warehouse.secretAccessKey')}
                disabled={disabled}
            />
            {!isServerless && (
                <BooleanSwitch
                    name="warehouse.autoCreate"
                    label="Auto-create database user"
                    description="Create the database user automatically if it does not already exist (GetClusterCredentials AutoCreate)."
                    {...form.getInputProps('warehouse.autoCreate', {
                        type: 'checkbox',
                    })}
                    disabled={disabled}
                />
            )}
        </>
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

    const warehouse = form.values.warehouse;

    const savedAuthenticationType =
        savedProject?.warehouseConnection?.type === WarehouseTypes.REDSHIFT
            ? savedProject.warehouseConnection.authenticationType
            : undefined;

    const defaultAuthenticationType =
        savedAuthenticationType ?? RedshiftAuthenticationType.PASSWORD;

    useEffect(() => {
        const currentType = warehouse.authenticationType;

        if (!currentType) {
            form.setFieldValue(
                'warehouse.authenticationType',
                defaultAuthenticationType,
            );
        }
    }, [defaultAuthenticationType, form, warehouse.authenticationType]);

    const authenticationType =
        warehouse.authenticationType ?? defaultAuthenticationType;

    const isPasswordAuthentication =
        authenticationType === RedshiftAuthenticationType.PASSWORD;
    const isIamAuthentication =
        authenticationType === RedshiftAuthenticationType.IAM;
    const isIamBrowserAuthentication =
        authenticationType === RedshiftAuthenticationType.IAM_BROWSER;
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
            <Stack mt="xs">
                <TextInput
                    name="warehouse.host"
                    label="Host"
                    description="This is the host where the database is running."
                    required
                    {...form.getInputProps('warehouse.host')}
                    disabled={disabled}
                    labelProps={{ style: { marginTop: '8px' } }}
                />
                <Select
                    name="warehouse.authenticationType"
                    label="Authentication type"
                    description="Choose whether to authenticate with a database username and password, AWS IAM (temporary credentials), or AWS IAM Identity Center (browser sign-in)."
                    data={[
                        {
                            value: RedshiftAuthenticationType.PASSWORD,
                            label: 'Username & password',
                        },
                        {
                            value: RedshiftAuthenticationType.IAM,
                            label: 'AWS IAM',
                        },
                        {
                            value: RedshiftAuthenticationType.IAM_BROWSER,
                            label: 'AWS IAM Identity Center',
                        },
                    ]}
                    defaultValue={defaultAuthenticationType}
                    {...form.getInputProps('warehouse.authenticationType')}
                    required
                    disabled={disabled}
                />
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
                    <RedshiftIamFields
                        disabled={disabled}
                        isServerless={isServerless}
                    />
                )}
                {isIamBrowserAuthentication && (
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
                        <RedshiftAwsSsoFields disabled={disabled} />
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
                    <Stack mt="xs">
                        <BooleanSwitch
                            name="warehouse.requireUserCredentials"
                            label="Require users to provide their own credentials"
                            {...form.getInputProps(
                                'warehouse.requireUserCredentials',
                                {
                                    type: 'checkbox',
                                },
                            )}
                            defaultChecked={
                                RedshiftDefaultValues.requireUserCredentials
                            }
                            disabled={disabled}
                        />

                        {isIamAuthentication && (
                            <RedshiftIamAdvancedFields
                                disabled={disabled}
                                isServerless={isServerless}
                                requireSecrets={requireSecrets}
                            />
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
                                        inherit
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
                            allowDeselect={false}
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
                                        inherit
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
                            <Stack mb="xs">
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
                                        rightSectionPointerEvents="all"
                                        rightSection={
                                            <>
                                                <CopyActionIcon
                                                    value={sshTunnelPublicKey}
                                                    tooltipPosition="right"
                                                    aria-label="Copy SSH tunnel public key"
                                                    onMouseDown={(event) =>
                                                        event.preventDefault()
                                                    }
                                                />
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
