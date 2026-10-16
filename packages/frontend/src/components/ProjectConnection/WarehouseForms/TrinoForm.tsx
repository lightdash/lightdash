import { WarehouseTypes } from '@lightdash/common';
import { TextInput, Stack, Anchor, Select, PasswordInput } from '@mantine/core';
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
import { TrinoDefaultValues } from './defaultValues';

export const TrinoSchemaInput: FC<{
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

const TrinoForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const { t } = useTranslation('projectConnection');
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.TRINO;
    const form = useFormContext();
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
                                { type: 'checkbox' },
                            )}
                            defaultChecked={
                                TrinoDefaultValues.requireUserCredentials
                            }
                            disabled={disabled}
                        />

                        <NumberInput
                            name="warehouse.port"
                            {...form.getInputProps('warehouse.port')}
                            defaultValue={TrinoDefaultValues.port}
                            label={t('warehouseFields.port')}
                            description={t(
                                'warehouseFields.databaseNameDescription',
                            )}
                            required
                            disabled={disabled}
                        />

                        <Select
                            allowDeselect={false}
                            name="warehouse.http_scheme"
                            {...form.getInputProps('warehouse.http_scheme')}
                            defaultValue={TrinoDefaultValues.http_scheme}
                            label={t('warehouseFields.sslMode')}
                            description={
                                <p>
                                    <Trans
                                        t={t}
                                        i18nKey="warehouseFields.trinoSslModeDescription"
                                        components={{
                                            docsLink: (
                                                <Anchor
                                                    inherit
                                                    target="_blank"
                                                    href="https://docs.getdbt.com/reference/warehouse-setups/trino-setup#configuration"
                                                    rel="noreferrer"
                                                />
                                            ),
                                        }}
                                    />
                                </p>
                            }
                            data={['http', 'https'].map((x) => ({
                                value: x,
                                label: x,
                            }))}
                            disabled={disabled}
                        />

                        <TextInput
                            name="warehouse.source"
                            label={t('warehouseFields.source')}
                            description={t('warehouseFields.sourceDescription')}
                            placeholder={t(
                                'warehouseFields.trinoSourcePlaceholder',
                            )}
                            {...form.getInputProps('warehouse.source')}
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

export default TrinoForm;
