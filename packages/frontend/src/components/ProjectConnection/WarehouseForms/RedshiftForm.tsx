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
import { Trans, useTranslation } from 'react-i18next';
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
import { SshStaticIpHint } from './SshStaticIpHint';

export const RedshiftSchemaInput: FC<{
    disabled: boolean;
    description?: ReactNode;
}> = ({ disabled, description }) => {
    const { t } = useTranslation('projectConnection');
    const form = useFormContext();
    return (
        <TextInput
            name="warehouse.schema"
            label={t('warehouseFields.schema')}
            description={description ?? t('warehouseFields.schemaDescription')}
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
    const { t } = useTranslation('projectConnection');
    const form = useFormContext();

    return (
        <>
            <TextInput
                name="warehouse.awsSsoStartUrl"
                label={t('warehouseFields.awsAccessPortalUrl')}
                description={t('warehouseFields.awsAccessPortalUrlDescription')}
                placeholder="https://your-start-url.awsapps.com/start"
                required={required}
                {...form.getInputProps('warehouse.awsSsoStartUrl')}
                disabled={disabled}
            />
            <TextInput
                name="warehouse.awsSsoRegion"
                label={t('warehouseFields.identityCenterRegion')}
                description={t(
                    'warehouseFields.identityCenterRegionDescription',
                )}
                placeholder="us-east-1"
                required={required}
                {...form.getInputProps('warehouse.awsSsoRegion')}
                disabled={disabled}
            />
            <TextInput
                name="warehouse.awsSsoAccountId"
                label={t('warehouseFields.awsAccountId')}
                description={t('warehouseFields.awsAccountIdDescription')}
                placeholder="123456789012"
                required={required}
                {...form.getInputProps('warehouse.awsSsoAccountId')}
                disabled={disabled}
            />
            <TextInput
                name="warehouse.awsSsoRoleName"
                label={t('warehouseFields.awsRoleName')}
                description={t('warehouseFields.awsRoleNameDescription')}
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
    const { t } = useTranslation('projectConnection');
    const form = useFormContext();

    return (
        <>
            <TextInput
                name="warehouse.region"
                label={t('warehouseFields.awsRegion')}
                description={t('warehouseFields.redshiftRegionDescription')}
                required
                placeholder="us-east-1"
                {...form.getInputProps('warehouse.region')}
                disabled={disabled}
            />
            <BooleanSwitch
                name="warehouse.isServerless"
                label={t('warehouseFields.redshiftServerless')}
                description={t('warehouseFields.redshiftServerlessDescription')}
                {...form.getInputProps('warehouse.isServerless', {
                    type: 'checkbox',
                })}
                disabled={disabled}
            />
            {isServerless ? (
                <TextInput
                    name="warehouse.workgroupName"
                    label={t('warehouseFields.workgroupName')}
                    description={t('warehouseFields.workgroupNameDescription')}
                    required
                    {...form.getInputProps('warehouse.workgroupName')}
                    disabled={disabled}
                />
            ) : (
                <TextInput
                    name="warehouse.clusterIdentifier"
                    label={t('warehouseFields.clusterIdentifier')}
                    description={t(
                        'warehouseFields.clusterIdentifierDescription',
                    )}
                    required
                    {...form.getInputProps('warehouse.clusterIdentifier')}
                    disabled={disabled}
                />
            )}
            <TextInput
                name="warehouse.user"
                label={t('warehouseFields.databaseUser')}
                description={t('warehouseFields.databaseUserDescription')}
                required={!isServerless}
                {...form.getInputProps('warehouse.user')}
                disabled={disabled}
            />
            <TextInput
                name="warehouse.assumeRoleArn"
                label={t('warehouseFields.assumeRoleArn')}
                description={t(
                    'warehouseFields.redshiftAssumeRoleArnDescription',
                )}
                placeholder="arn:aws:iam::123456789012:role/my-redshift-role"
                {...form.getInputProps('warehouse.assumeRoleArn')}
                disabled={disabled}
            />
            <TextInput
                name="warehouse.assumeRoleExternalId"
                label={t('warehouseFields.assumeRoleExternalId')}
                description={t(
                    'warehouseFields.assumeRoleExternalIdRequiredDescription',
                )}
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
    const { t } = useTranslation('projectConnection');
    const form = useFormContext();

    return (
        <>
            <TextInput
                name="warehouse.accessKeyId"
                label={t('warehouseFields.awsAccessKeyId')}
                description={t('warehouseFields.staticAccessKeyDescription')}
                placeholder={
                    disabled || !requireSecrets ? '**************' : undefined
                }
                {...form.getInputProps('warehouse.accessKeyId')}
                disabled={disabled}
            />
            <PasswordInput
                name="warehouse.secretAccessKey"
                label={t('warehouseFields.awsSecretAccessKey')}
                description={t('warehouseFields.secretAccessKeyDescription')}
                placeholder={
                    disabled || !requireSecrets ? '**************' : undefined
                }
                {...form.getInputProps('warehouse.secretAccessKey')}
                disabled={disabled}
            />
            {!isServerless && (
                <BooleanSwitch
                    name="warehouse.autoCreate"
                    label={t('warehouseFields.autoCreateUser')}
                    description={t('warehouseFields.autoCreateUserDescription')}
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
    const { t } = useTranslation('projectConnection');
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
                    label={t('warehouseFields.host')}
                    description={t('warehouseFields.hostDescription')}
                    required
                    {...form.getInputProps('warehouse.host')}
                    disabled={disabled}
                    labelProps={{ style: { marginTop: '8px' } }}
                />
                <Select
                    name="warehouse.authenticationType"
                    label={t('warehouseFields.authenticationType')}
                    description={t(
                        'warehouseFields.redshiftAuthenticationDescription',
                    )}
                    data={[
                        {
                            value: RedshiftAuthenticationType.PASSWORD,
                            label: t('warehouseFields.usernamePassword'),
                        },
                        {
                            value: RedshiftAuthenticationType.IAM,
                            label: t('warehouseFields.awsIam'),
                        },
                        {
                            value: RedshiftAuthenticationType.IAM_BROWSER,
                            label: t('warehouseFields.awsIamIdentityCenter'),
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
                            label={t('warehouseFields.user')}
                            description={t('warehouseFields.userDescription')}
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
                            label={t('warehouseFields.password')}
                            description={t(
                                'warehouseFields.passwordDescription',
                            )}
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
                            label={t('warehouseFields.awsRegion')}
                            description={t(
                                'warehouseFields.redshiftRegionDescription',
                            )}
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
                    label={t('warehouseFields.dbName')}
                    description={t('warehouseFields.databaseNameDescription')}
                    required
                    {...form.getInputProps('warehouse.dbname')}
                    disabled={disabled}
                />
                <FormSection isOpen={isOpen} name="advanced">
                    <Stack mt="xs">
                        <BooleanSwitch
                            name="warehouse.requireUserCredentials"
                            label={t('warehouseFields.requireUserCredentials')}
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
                            label={t('warehouseFields.port')}
                            description={t('warehouseFields.portDescription')}
                            required
                            disabled={disabled}
                        />

                        <NumberInput
                            name="warehouse.keepalivesIdle"
                            {...form.getInputProps('warehouse.keepalivesIdle')}
                            defaultValue={RedshiftDefaultValues.keepalivesIdle}
                            label={t('warehouseFields.keepAliveIdle')}
                            description={
                                <p>
                                    <Trans
                                        t={t}
                                        i18nKey="warehouseFields.keepAliveIdleDescription"
                                        components={{
                                            docsLink: (
                                                <Anchor
                                                    inherit
                                                    target="_blank"
                                                    href="https://postgresqlco.nf/doc/en/param/tcp_keepalives_idle/"
                                                    rel="noreferrer"
                                                />
                                            ),
                                        }}
                                    />
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
                            label={t('warehouseFields.sslMode')}
                            description={
                                <p>
                                    <Trans
                                        t={t}
                                        i18nKey="warehouseFields.redshiftSslModeDescription"
                                        components={{
                                            docsLink: (
                                                <Anchor
                                                    inherit
                                                    target="_blank"
                                                    href="https://docs.getdbt.com/docs/core/connect-data-platform/redshift-setup#sslmode-change"
                                                    rel="noreferrer"
                                                />
                                            ),
                                        }}
                                    />
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
                            label={t('warehouseFields.useRa3Node')}
                            description={t(
                                'warehouseFields.ra3NodeDescription',
                            )}
                            {...form.getInputProps('warehouse.ra3Node', {
                                type: 'checkbox',
                            })}
                            onLabel={t('state.yes', { ns: 'common' })}
                            offLabel={t('state.no', { ns: 'common' })}
                        />

                        <DataTimezoneField disabled={disabled} />
                        <StartOfWeekSelect disabled={disabled} />

                        <NumberInput
                            name="warehouse.timeoutSeconds"
                            {...form.getInputProps('warehouse.timeoutSeconds')}
                            defaultValue={RedshiftDefaultValues.timeoutSeconds}
                            label={t('warehouseFields.timeoutSeconds')}
                            description={
                                <p>
                                    {t(
                                        'warehouseFields.queryTimeoutDescription',
                                    )}
                                </p>
                            }
                            required
                            disabled={disabled}
                        />

                        <BooleanSwitch
                            name="warehouse.useSshTunnel"
                            label={t('warehouseFields.useSshTunnel')}
                            description={t(
                                'warehouseFields.useSshTunnelDescription',
                            )}
                            {...form.getInputProps('warehouse.useSshTunnel', {
                                type: 'checkbox',
                            })}
                            onLabel={t('state.yes', { ns: 'common' })}
                            offLabel={t('state.no', { ns: 'common' })}
                            defaultChecked={RedshiftDefaultValues.useSshTunnel}
                        />

                        <FormSection
                            isOpen={showSshTunnelConfiguration}
                            name="ssh-config"
                        >
                            <Stack mb="xs">
                                <TextInput
                                    name="warehouse.sshTunnelHost"
                                    label={t('warehouseFields.sshRemoteHost')}
                                    disabled={disabled}
                                    {...form.getInputProps(
                                        'warehouse.sshTunnelHost',
                                    )}
                                />

                                <SshStaticIpHint />

                                <NumberInput
                                    name="warehouse.sshTunnelPort"
                                    defaultValue={22}
                                    {...form.getInputProps(
                                        'warehouse.sshTunnelPort',
                                    )}
                                    label={t('warehouseFields.sshRemotePort')}
                                    disabled={disabled}
                                />

                                <TextInput
                                    name="warehouse.sshTunnelUser"
                                    label={t('warehouseFields.sshUsername')}
                                    disabled={disabled}
                                    {...form.getInputProps(
                                        'warehouse.sshTunnelUser',
                                    )}
                                />

                                <TextInput
                                    name="warehouse.sshTunnelPublicKey"
                                    {...form.getInputProps(
                                        'warehouse.sshTunnelPublicKey',
                                    )}
                                    value={sshTunnelPublicKey ?? ''}
                                    label={t('warehouseFields.sshPublicKey')}
                                    description={t(
                                        'warehouseFields.sshPublicKeyDescription',
                                    )}
                                    placeholder={t(
                                        'warehouseFields.noKeyGenerated',
                                    )}
                                    readOnly={true}
                                    disabled={disabled}
                                    rightSectionPointerEvents="all"
                                    rightSection={
                                        sshTunnelPublicKey ? (
                                            <CopyActionIcon
                                                value={sshTunnelPublicKey}
                                                tooltipPosition="right"
                                                aria-label={t(
                                                    'warehouseFields.copySshPublicKey',
                                                )}
                                                onMouseDown={(event) =>
                                                    event.preventDefault()
                                                }
                                            />
                                        ) : undefined
                                    }
                                />
                                <Button
                                    onClick={() => mutate()}
                                    loading={isLoading}
                                    disabled={disabled || isLoading}
                                >
                                    {sshTunnelPublicKey
                                        ? t('warehouseFields.regenerateKey')
                                        : t(
                                              'warehouseFields.generatePublicKey',
                                          )}
                                </Button>
                            </Stack>
                        </FormSection>
                    </Stack>
                </FormSection>

                <FormCollapseButton isSectionOpen={isOpen} onClick={toggleOpen}>
                    {t('dbtSettings.advancedOptions')}
                </FormCollapseButton>
            </Stack>
        </>
    );
};

export default RedshiftForm;
