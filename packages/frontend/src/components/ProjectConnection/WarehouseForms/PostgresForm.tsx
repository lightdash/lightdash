import { WarehouseTypes } from '@lightdash/common';
import {
    TextInput,
    Stack,
    Button,
    Anchor,
    Select,
    PasswordInput,
    Text,
} from '@mantine/core';
import React, { type FC, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';
import { CopyActionIcon } from '../../common/CopyActionIcon';
import { NumberInput } from '../../common/NumberInput';
import FormCollapseButton from '../FormCollapseButton';
import { useFormContext } from '../formContext';
import BooleanSwitch from '../Inputs/BooleanSwitch';
import CertificateFileInput from '../Inputs/CertificateFileInput';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';
import { useProjectFormContext } from '../useProjectFormContext';
import DataTimezoneField from './DataTimezoneField';
import { PostgresDefaultValues } from './defaultValues';
import { useCreateSshKeyPair } from './sshHooks';
import { SshStaticIpHint } from './SshStaticIpHint';

export const PostgresSchemaInput: FC<{
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

const PostgresForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const { t } = useTranslation('projectConnection');
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject, isProjectExtraConnection } = useProjectFormContext();
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
            <Stack mt="xs">
                <TextInput
                    label={t('warehouseFields.host')}
                    description={t('warehouseFields.hostDescription')}
                    required
                    name="warehouse.host"
                    {...form.getInputProps('warehouse.host')}
                    disabled={disabled}
                    labelProps={{ style: { marginTop: '8px' } }}
                />
                <TextInput
                    label={t('warehouseFields.user')}
                    description={t('warehouseFields.userDescription')}
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
                    label={t('warehouseFields.password')}
                    description={t('warehouseFields.passwordDescription')}
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
                    label={t('warehouseFields.dbName')}
                    description={t('warehouseFields.databaseNameDescription')}
                    required
                    name="warehouse.dbname"
                    {...form.getInputProps('warehouse.dbname')}
                    disabled={disabled}
                />
                <FormSection isOpen={isOpen} name="advanced">
                    <Stack mt="xs">
                        {isProjectExtraConnection ? (
                            <Text size="sm" c="dimmed">
                                {t(
                                    'warehouseFields.requireUserCredentialsInherited',
                                )}
                            </Text>
                        ) : (
                            <BooleanSwitch
                                name="warehouse.requireUserCredentials"
                                {...form.getInputProps(
                                    'warehouse.requireUserCredentials',
                                    {
                                        type: 'checkbox',
                                    },
                                )}
                                label={t(
                                    'warehouseFields.requireUserCredentials',
                                )}
                                disabled={disabled}
                                defaultChecked={
                                    PostgresDefaultValues.requireUserCredentials
                                }
                            />
                        )}
                        <NumberInput
                            name="warehouse.port"
                            {...form.getInputProps('warehouse.port')}
                            defaultValue={PostgresDefaultValues.port}
                            label={t('warehouseFields.port')}
                            description={t('warehouseFields.portDescription')}
                            required
                            disabled={disabled}
                        />

                        <NumberInput
                            name="warehouse.keepalivesIdle"
                            {...form.getInputProps('warehouse.keepalivesIdle')}
                            defaultValue={PostgresDefaultValues.keepalivesIdle}
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

                        <TextInput
                            name="warehouse.searchPath"
                            {...form.getInputProps('warehouse.searchPath')}
                            label={t('warehouseFields.searchPath')}
                            description={
                                <p>
                                    <Trans
                                        t={t}
                                        i18nKey="warehouseFields.searchPathDescription"
                                        components={{
                                            docsLink: (
                                                <Anchor
                                                    inherit
                                                    target="_blank"
                                                    href="https://docs.getdbt.com/reference/warehouse-profiles/postgres-profile#search_path"
                                                    rel="noreferrer"
                                                />
                                            ),
                                        }}
                                    />
                                </p>
                            }
                            disabled={disabled}
                        />

                        <Select
                            allowDeselect={false}
                            name="warehouse.sslmode"
                            {...form.getInputProps('warehouse.sslmode')}
                            defaultValue={PostgresDefaultValues.sslmode}
                            label={t('warehouseFields.sslMode')}
                            description={
                                <p>
                                    <Trans
                                        t={t}
                                        i18nKey="warehouseFields.postgresSslModeDescription"
                                        components={{
                                            docsLink: (
                                                <Anchor
                                                    inherit
                                                    target="_blank"
                                                    href="https://docs.getdbt.com/reference/warehouse-profiles/postgres-profile#sslmode"
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
                                            {t(
                                                'warehouseFields.sslCertDescription',
                                            )}
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
                                            {t(
                                                'warehouseFields.sslKeyDescription',
                                            )}
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
                                            {t(
                                                'warehouseFields.sslRootCertDescription',
                                            )}
                                        </p>
                                    }
                                />
                            </>
                        ) : null}

                        <TextInput
                            name="warehouse.role"
                            label={t('warehouseFields.role')}
                            disabled={disabled}
                            {...form.getInputProps('warehouse.role')}
                        />

                        <DataTimezoneField disabled={disabled} />
                        <StartOfWeekSelect disabled={disabled} />

                        <NumberInput
                            name="warehouse.timeoutSeconds"
                            defaultValue={PostgresDefaultValues.timeoutSeconds}
                            {...form.getInputProps('warehouse.timeoutSeconds')}
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
                            {...form.getInputProps('warehouse.useSshTunnel', {
                                type: 'checkbox',
                            })}
                            label={t('warehouseFields.useSshTunnel')}
                            disabled={disabled}
                        />

                        <FormSection
                            isOpen={showSshTunnelConfiguration}
                            name="ssh-config"
                        >
                            <Stack mb="xs">
                                <TextInput
                                    label={t('warehouseFields.sshRemoteHost')}
                                    disabled={disabled}
                                    name="warehouse.sshTunnelHost"
                                    {...form.getInputProps(
                                        'warehouse.sshTunnelHost',
                                    )}
                                />

                                <SshStaticIpHint />

                                <NumberInput
                                    name="warehouse.sshTunnelPort"
                                    {...form.getInputProps(
                                        'warehouse.sshTunnelPort',
                                    )}
                                    defaultValue={
                                        PostgresDefaultValues.sshTunnelPort
                                    }
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

export default PostgresForm;
