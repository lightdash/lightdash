import { WarehouseTypes } from '@lightdash/common';
import { TextInput, Stack, Anchor, PasswordInput } from '@mantine/core';
import React, { type FC, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';
import { NumberInput } from '../../common/NumberInput';
import FormCollapseButton from '../FormCollapseButton';
import { useFormContext } from '../formContext';
import BooleanSwitch from '../Inputs/BooleanSwitch';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';
import { useProjectFormContext } from '../useProjectFormContext';
import DataTimezoneField from './DataTimezoneField';
import { ClickhouseDefaultValues } from './defaultValues';

export const ClickhouseSchemaInput: FC<{
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

const ClickhouseForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const { t } = useTranslation('projectConnection');
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.CLICKHOUSE;
    const form = useFormContext();

    if (form.values.warehouse?.type !== WarehouseTypes.CLICKHOUSE) {
        throw new Error('This form is only available for ClickHouse');
    }

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
                    description={t('warehouseFields.passwordDescription')}
                    required={requireSecrets}
                    placeholder={
                        disabled || !requireSecrets
                            ? '**************'
                            : undefined
                    }
                    {...form.getInputProps('warehouse.password')}
                    disabled={disabled}
                />

                <FormSection isOpen={isOpen} name="advanced">
                    <Stack mt="xs">
                        <BooleanSwitch
                            name="warehouse.requireUserCredentials"
                            label={t('warehouseFields.requireUserCredentials')}
                            {...form.getInputProps(
                                'warehouse.requireUserCredentials',
                                { type: 'checkbox' },
                            )}
                            defaultChecked={
                                ClickhouseDefaultValues.requireUserCredentials
                            }
                            disabled={disabled}
                        />

                        <NumberInput
                            name="warehouse.port"
                            {...form.getInputProps('warehouse.port')}
                            defaultValue={ClickhouseDefaultValues.port}
                            label={t('warehouseFields.port')}
                            description={t('warehouseFields.portDescription')}
                            required
                            disabled={disabled}
                        />

                        <BooleanSwitch
                            name="warehouse.secure"
                            label={t('warehouseFields.useHttps')}
                            description={
                                <p>
                                    <Trans
                                        t={t}
                                        i18nKey="warehouseFields.useHttpsDescription"
                                        components={{
                                            docsLink: (
                                                <Anchor
                                                    inherit
                                                    target="_blank"
                                                    href="https://docs.getdbt.com/reference/warehouse-setups/clickhouse-setup"
                                                    rel="noreferrer"
                                                />
                                            ),
                                        }}
                                    />
                                </p>
                            }
                            {...form.getInputProps('warehouse.secure', {
                                type: 'checkbox',
                            })}
                            defaultChecked={ClickhouseDefaultValues.secure}
                            disabled={disabled}
                        />

                        <NumberInput
                            name="warehouse.timeoutSeconds"
                            defaultValue={
                                ClickhouseDefaultValues.timeoutSeconds
                            }
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

                        <DataTimezoneField disabled={disabled} />
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

export default ClickhouseForm;
