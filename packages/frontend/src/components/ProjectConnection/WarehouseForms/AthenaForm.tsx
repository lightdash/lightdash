import {
    AthenaAuthenticationType,
    FeatureFlags,
    WarehouseTypes,
} from '@lightdash/common';
import { TextInput, Stack, Anchor, Select, PasswordInput } from '@mantine/core';
import { useEffect, type FC, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';
import useHealth from '../../../hooks/health/useHealth';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { NumberInput } from '../../common/NumberInput';
import FormCollapseButton from '../FormCollapseButton';
import { useFormContext } from '../formContext';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';
import { useProjectFormContext } from '../useProjectFormContext';
import AthenaWebIdentityFields from './AthenaWebIdentityFields';
import { useCreateAwsWebIdentityAudience } from './awsWebIdentityHooks';
import { AthenaDefaultValues } from './defaultValues';

export const AthenaSchemaInput: FC<{
    disabled: boolean;
    description?: ReactNode;
}> = ({ disabled, description }) => {
    const { t } = useTranslation('projectConnection');
    const form = useFormContext();

    return (
        <TextInput
            name="warehouse.schema"
            label={t('warehouseFields.schema')}
            description={
                description ?? t('warehouseFields.athenaSchemaDescription')
            }
            required
            {...form.getInputProps('warehouse.schema')}
            disabled={disabled}
        />
    );
};

const AthenaForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const { t } = useTranslation('projectConnection');
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject, projectUuid } = useProjectFormContext();
    const health = useHealth();
    const webIdentityFlag = useServerFeatureFlag(
        FeatureFlags.AthenaWebIdentityAuth,
    );
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.ATHENA;
    const form = useFormContext();

    const warehouse = form.values.warehouse;

    if (warehouse?.type !== WarehouseTypes.ATHENA) {
        throw new Error('Athena form is not used for this warehouse type');
    }

    const isIamRoleAuthEnabled =
        health.data?.isAthenaWarehouseIamRoleAuthEnabled ?? false;
    const isWebIdentityAuthEnabled = webIdentityFlag.data?.enabled === true;
    const enabledAuthenticationTypes = [
        AthenaAuthenticationType.ACCESS_KEY,
        ...(isIamRoleAuthEnabled ? [AthenaAuthenticationType.IAM_ROLE] : []),
        ...(isWebIdentityAuthEnabled
            ? [AthenaAuthenticationType.WEB_IDENTITY]
            : []),
    ];
    const isAuthenticationTypeEnabled = (
        type: AthenaAuthenticationType | undefined,
    ): type is AthenaAuthenticationType =>
        type !== undefined && enabledAuthenticationTypes.includes(type);

    const savedAuthenticationType =
        savedProject?.warehouseConnection?.type === WarehouseTypes.ATHENA
            ? savedProject.warehouseConnection.authenticationType
            : undefined;

    const defaultAuthenticationType =
        savedAuthenticationType ?? AthenaAuthenticationType.ACCESS_KEY;

    const fallbackAuthenticationType = isAuthenticationTypeEnabled(
        defaultAuthenticationType,
    )
        ? defaultAuthenticationType
        : AthenaAuthenticationType.ACCESS_KEY;

    const isCurrentTypeEnabled = isAuthenticationTypeEnabled(
        warehouse.authenticationType,
    );
    const hasEnabledTypes = !!health.data && webIdentityFlag.isFetched;

    useEffect(() => {
        // Wait until the enabled types are known, so a saved type isn't reset.
        if (hasEnabledTypes && !isCurrentTypeEnabled) {
            form.setFieldValue(
                'warehouse.authenticationType',
                fallbackAuthenticationType,
            );
        }
    }, [
        hasEnabledTypes,
        isCurrentTypeEnabled,
        fallbackAuthenticationType,
        form,
    ]);

    const authenticationType = isAuthenticationTypeEnabled(
        warehouse.authenticationType,
    )
        ? warehouse.authenticationType
        : fallbackAuthenticationType;

    const isAccessKeyAuthentication =
        authenticationType === AthenaAuthenticationType.ACCESS_KEY;
    const isWebIdentityAuthentication =
        authenticationType === AthenaAuthenticationType.WEB_IDENTITY;

    const savedAudience =
        savedProject?.warehouseConnection?.type === WarehouseTypes.ATHENA
            ? savedProject.warehouseConnection.webIdentityAudience
            : undefined;

    const createAudience = useCreateAwsWebIdentityAudience({
        onSuccess: (result) => {
            form.setFieldValue(
                'warehouse.webIdentityAudience',
                result.audience,
            );
        },
    });
    const generateAudience = () =>
        createAudience.mutate({
            projectUuid: savedProject?.projectUuid ?? projectUuid ?? null,
        });

    const authenticationTypeInput = form.getInputProps(
        'warehouse.authenticationType',
    );
    const onAuthenticationTypeChange = (value: string | null) => {
        const isSwitchingWebIdentity =
            (value === AthenaAuthenticationType.WEB_IDENTITY) !==
            isWebIdentityAuthentication;
        // Each mode uses the role differently, so a role set for one must not
        // carry over to the other.
        if (isSwitchingWebIdentity) {
            form.setFieldValue('warehouse.assumeRoleArn', '');
            form.setFieldValue('warehouse.assumeRoleExternalId', '');
        }
        authenticationTypeInput.onChange(value);
        // Generate an audience straight away, so the trust policy can be
        // written before the connection is saved.
        if (
            value === AthenaAuthenticationType.WEB_IDENTITY &&
            !warehouse.webIdentityAudience
        ) {
            generateAudience();
        }
    };

    return (
        <>
            <Stack mt="sm">
                <TextInput
                    name="warehouse.region"
                    label={t('warehouseFields.awsRegion')}
                    description={
                        <p>
                            <Trans
                                t={t}
                                i18nKey="warehouseFields.athenaRegionDescription"
                                components={{
                                    docsLink: (
                                        <Anchor
                                            inherit
                                            target="_blank"
                                            href="https://docs.getdbt.com/docs/core/connect-data-platform/athena-setup"
                                            rel="noreferrer"
                                        />
                                    ),
                                }}
                            />
                        </p>
                    }
                    required
                    {...form.getInputProps('warehouse.region')}
                    placeholder="us-east-1"
                    disabled={disabled}
                />
                <TextInput
                    name="warehouse.database"
                    label={t('warehouseFields.catalog')}
                    description={t('warehouseFields.athenaCatalogDescription')}
                    required
                    {...form.getInputProps('warehouse.database')}
                    placeholder="AwsDataCatalog"
                    disabled={disabled}
                />
                <TextInput
                    name="warehouse.schema"
                    label={t('warehouseFields.database')}
                    description={t('warehouseFields.athenaDatabaseDescription')}
                    required
                    {...form.getInputProps('warehouse.schema')}
                    disabled={disabled}
                />
                <TextInput
                    name="warehouse.s3StagingDir"
                    label={t('warehouseFields.s3StagingDir')}
                    description={t('warehouseFields.s3StagingDirDescription')}
                    required
                    {...form.getInputProps('warehouse.s3StagingDir')}
                    placeholder="s3://your-bucket/athena-results/"
                    disabled={disabled}
                />
                <TextInput
                    name="warehouse.s3DataDir"
                    label={t('warehouseFields.s3DataDir')}
                    description={t('warehouseFields.s3DataDirDescription')}
                    {...form.getInputProps('warehouse.s3DataDir')}
                    placeholder="s3://your-bucket/data/"
                    disabled={disabled}
                />
                {enabledAuthenticationTypes.length > 1 && (
                    <Select
                        allowDeselect={false}
                        name="warehouse.authenticationType"
                        label={t('warehouseFields.authenticationType')}
                        description={t(
                            'warehouseFields.athenaAuthenticationDescription',
                        )}
                        data={[
                            {
                                value: AthenaAuthenticationType.ACCESS_KEY,
                                label: t('warehouseFields.accessKeys'),
                            },
                            ...(isIamRoleAuthEnabled
                                ? [
                                      {
                                          value: AthenaAuthenticationType.IAM_ROLE,
                                          label: t('warehouseFields.iamRole'),
                                      },
                                  ]
                                : []),
                            ...(isWebIdentityAuthEnabled
                                ? [
                                      {
                                          value: AthenaAuthenticationType.WEB_IDENTITY,
                                          label: t(
                                              'warehouseFields.webIdentity',
                                          ),
                                      },
                                  ]
                                : []),
                        ]}
                        defaultValue={fallbackAuthenticationType}
                        {...authenticationTypeInput}
                        onChange={onAuthenticationTypeChange}
                        required
                        disabled={disabled}
                    />
                )}
                {isAccessKeyAuthentication && (
                    <>
                        <TextInput
                            name="warehouse.accessKeyId"
                            label={t('warehouseFields.awsAccessKeyId')}
                            description={t(
                                'warehouseFields.awsAccessKeyIdDescription',
                            )}
                            required
                            placeholder={
                                disabled || !requireSecrets
                                    ? '**************'
                                    : undefined
                            }
                            {...form.getInputProps('warehouse.accessKeyId')}
                            disabled={disabled}
                        />
                        <PasswordInput
                            name="warehouse.secretAccessKey"
                            label={t('warehouseFields.awsSecretAccessKey')}
                            description={t(
                                'warehouseFields.awsSecretAccessKeyDescription',
                            )}
                            required
                            placeholder={
                                disabled || !requireSecrets
                                    ? '**************'
                                    : undefined
                            }
                            {...form.getInputProps('warehouse.secretAccessKey')}
                            disabled={disabled}
                        />
                    </>
                )}

                {isWebIdentityAuthentication && (
                    <AthenaWebIdentityFields
                        disabled={disabled}
                        savedAudience={savedAudience}
                        createAudience={createAudience}
                        onGenerateAudience={generateAudience}
                    />
                )}

                <FormSection isOpen={isOpen} name="advanced">
                    <Stack mt="sm">
                        {!isWebIdentityAuthentication && (
                            <>
                                <TextInput
                                    name="warehouse.assumeRoleArn"
                                    label={t('warehouseFields.assumeRoleArn')}
                                    description={t(
                                        'warehouseFields.assumeRoleArnDescription',
                                    )}
                                    {...form.getInputProps(
                                        'warehouse.assumeRoleArn',
                                    )}
                                    placeholder="arn:aws:iam::123456789012:role/my-athena-role"
                                    disabled={disabled}
                                />
                                <TextInput
                                    name="warehouse.assumeRoleExternalId"
                                    label={t(
                                        'warehouseFields.assumeRoleExternalId',
                                    )}
                                    description={t(
                                        'warehouseFields.assumeRoleExternalIdDescription',
                                    )}
                                    {...form.getInputProps(
                                        'warehouse.assumeRoleExternalId',
                                    )}
                                    disabled={disabled}
                                />
                            </>
                        )}
                        <TextInput
                            name="warehouse.workGroup"
                            label={t('warehouseFields.workgroup')}
                            description={t(
                                'warehouseFields.workgroupDescription',
                            )}
                            {...form.getInputProps('warehouse.workGroup')}
                            placeholder="primary"
                            disabled={disabled}
                        />

                        <NumberInput
                            name="warehouse.threads"
                            label={t('warehouseFields.threads')}
                            description={t(
                                'warehouseFields.threadsDescription',
                            )}
                            defaultValue={AthenaDefaultValues.threads}
                            {...form.getInputProps('warehouse.threads')}
                            disabled={disabled}
                        />

                        <NumberInput
                            name="warehouse.numRetries"
                            label={t('warehouseFields.numberOfRetries')}
                            description={t(
                                'warehouseFields.retriesDescription',
                            )}
                            defaultValue={AthenaDefaultValues.numRetries}
                            {...form.getInputProps('warehouse.numRetries')}
                            disabled={disabled}
                        />

                        <StartOfWeekSelect disabled={disabled} />
                    </Stack>
                </FormSection>
                <FormCollapseButton isSectionOpen={isOpen} onClick={toggleOpen}>
                    {t('dbtSettings.advancedOptions')}
                </FormCollapseButton>
            </Stack>
        </>
    );
};

export default AthenaForm;
