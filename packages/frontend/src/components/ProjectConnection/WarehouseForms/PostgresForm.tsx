import { FeatureFlags, WarehouseTypes } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Button,
    CloseButton,
    CopyButton,
    FileInput,
    NumberInput,
    PasswordInput,
    Select,
    Stack,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import React, { type FC, useState } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { useToggle } from 'react-use';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import { hasNoWhiteSpaces } from '../../../utils/fieldValidators';
import BooleanSwitch from '../../ReactHookForm/BooleanSwitch';
import FormSection from '../../ReactHookForm/FormSection';
import MantineIcon from '../../common/MantineIcon';
import FormCollapseButton from '../FormCollapseButton';
import { useProjectFormContext } from '../useProjectFormContext';
import StartOfWeekSelect from './Inputs/StartOfWeekSelect';
import { useCreateSshKeyPair } from './sshHooks';

export const PostgresSchemaInput: FC<{
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

const CertificateFileInput: FC<{
    name: string;
    fileNameProperty: string;
    label: string;
    disabled: boolean;
    description: React.ReactNode;
    accept: string;
}> = ({ name, fileNameProperty, label, disabled, description, accept }) => {
    const { register, setValue } = useFormContext();
    const fileNamePlaceholder = useWatch({
        name: fileNameProperty,
    });
    const [temporaryFile, setTemporaryFile] = useState<File | null>(null);
    return (
        <>
            {/* Registering a hidden field for file name */}
            <input type="hidden" {...register(fileNameProperty)} />
            <Controller
                name={name}
                render={({ field }) => (
                    <FileInput
                        {...field}
                        label={label}
                        // FIXME: until mantine 7.4: https://github.com/mantinedev/mantine/issues/5401#issuecomment-1874906064
                        // @ts-ignore
                        placeholder={fileNamePlaceholder || 'Choose file...'}
                        description={description}
                        {...register(name)}
                        accept={accept}
                        value={temporaryFile}
                        onChange={(file) => {
                            if (file) {
                                const fileReader = new FileReader();
                                fileReader.onload = function (event) {
                                    const contents = event.target?.result;
                                    if (typeof contents === 'string') {
                                        setTemporaryFile(file);
                                        field.onChange(contents);
                                        setValue(fileNameProperty, file.name);
                                    } else {
                                        field.onChange(null);
                                        setValue(fileNameProperty, undefined);
                                    }
                                };
                                fileReader.readAsText(file);
                            }
                            field.onChange(null);
                        }}
                        disabled={disabled}
                        rightSection={
                            (temporaryFile || fileNamePlaceholder) && (
                                <CloseButton
                                    variant="transparent"
                                    onClick={() => {
                                        setTemporaryFile(null);
                                        field.onChange(null);
                                        setValue(fileNameProperty, undefined);
                                    }}
                                />
                            )
                        }
                    />
                )}
            />
        </>
    );
};

const PostgresForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.POSTGRES;
    const { setValue, register } = useFormContext();
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
    const sslMode: string = useWatch({
        name: 'warehouse.sslmode',
        defaultValue:
            savedProject?.warehouseConnection?.type ===
                WarehouseTypes.POSTGRES &&
            savedProject?.warehouseConnection?.sslmode,
    });
    const { mutate, isLoading } = useCreateSshKeyPair({
        onSuccess: (data) => {
            setValue('warehouse.sshTunnelPublicKey', data.publicKey);
        },
    });
    const isPassthroughLoginFeatureEnabled = useFeatureFlagEnabled(
        FeatureFlags.PassthroughLogin,
    );
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
                        {isPassthroughLoginFeatureEnabled && (
                            <BooleanSwitch
                                name="warehouse.requireUserCredentials"
                                label="Require users to provide their own credentials"
                                defaultValue={false}
                                disabled={disabled}
                            />
                        )}
                        <Controller
                            name="warehouse.port"
                            defaultValue={5432}
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
                        <TextInput
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
                            {...register('warehouse.searchPath')}
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
                                            Postgres databases using SSL. You
                                            can see more details in{' '}
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
                                    value={field.value}
                                    onChange={field.onChange}
                                    disabled={disabled}
                                />
                            )}
                        />
                        {sslMode === 'verify-full' ? (
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
                            </>
                        ) : null}
                        {sslMode === 'verify-ca' ||
                        sslMode === 'verify-full' ? (
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
                                        The trusted certificate authority (CA)
                                        certificate used to verify the database
                                        server’s identity.
                                    </p>
                                }
                            />
                        ) : null}

                        <TextInput
                            label="Role"
                            disabled={disabled}
                            {...register('warehouse.role')}
                        />

                        <StartOfWeekSelect disabled={disabled} />

                        <Controller
                            name="warehouse.timeoutSeconds"
                            defaultValue={300}
                            render={({ field }) => (
                                <NumberInput
                                    {...field}
                                    label="Timeout in seconds"
                                    description={
                                        <p>
                                            If a query takes longer than this
                                            timeout to complete, then the query
                                            will be cancelled.
                                        </p>
                                    }
                                    required
                                    disabled={disabled}
                                />
                            )}
                        />

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

export default PostgresForm;
