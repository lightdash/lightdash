import {
    Anchor,
    Select,
    Stack,
    Switch,
    Textarea,
    TextInput,
} from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import { type FC, useMemo } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';
import { SnowflakeOAuthInput } from '../../common/Authentication/SnowflakeOAuthInput';
import { NumberInput } from '../../common/NumberInput';
import FormCollapseButton from '../../ProjectConnection/FormCollapseButton';
import FormSection from '../../ProjectConnection/Inputs/FormSection';

type Props = {
    form: UseFormReturnType<any>;
    disabled: boolean;
    showName?: boolean;
    onAuthenticated?: (isAuthenticated: boolean) => void;
};

const DAYS_OF_WEEK = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
] as const;

export const SnowflakeCredentialsForm: FC<Props> = ({
    form,
    disabled,
    showName = true,
    onAuthenticated,
}) => {
    const { t } = useTranslation('userSettings');
    const [isOpen, toggleOpen] = useToggle(false);
    const daysOfWeekOptions = useMemo(
        () =>
            DAYS_OF_WEEK.map((day, index) => ({
                value: index.toString(),
                label: t(
                    `organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.daysOfWeek.${day}`,
                ),
            })),
        [t],
    );

    return (
        <Stack gap="xs">
            {showName && (
                <TextInput
                    required
                    size="xs"
                    label={t(
                        'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.nameLabel',
                    )}
                    disabled={disabled}
                    {...form.getInputProps('name')}
                />
            )}

            <Textarea
                size="xs"
                label={t(
                    'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.descriptionLabel',
                )}
                placeholder={t(
                    'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.descriptionPlaceholder',
                )}
                disabled={disabled}
                {...form.getInputProps('description')}
            />

            <TextInput
                required
                size="xs"
                label={t(
                    'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.accountLabel',
                )}
                placeholder={t(
                    'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.accountPlaceholder',
                )}
                description={t(
                    'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.accountDescription',
                )}
                disabled={disabled}
                {...form.getInputProps('credentials.account')}
            />

            <Select
                size="xs"
                name="warehouse.authenticationType"
                {...form.getInputProps('warehouse.authenticationType')}
                // TODO: default value is not being recognized. private key is always being selected
                defaultValue={'SSO'}
                label={t(
                    'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.authenticationTypeLabel',
                )}
                description={t(
                    'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.authenticationTypeDescription',
                )}
                data={['SSO']}
                disabled={true}
            />
            <SnowflakeOAuthInput onAuthenticated={onAuthenticated} />

            <TextInput
                required
                size="xs"
                label={t(
                    'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.databaseLabel',
                )}
                placeholder={t(
                    'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.databasePlaceholder',
                )}
                description={t(
                    'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.databaseDescription',
                )}
                disabled={disabled}
                {...form.getInputProps('credentials.database')}
            />

            <TextInput
                required
                size="xs"
                label={t(
                    'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.warehouseLabel',
                )}
                placeholder={t(
                    'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.warehousePlaceholder',
                )}
                description={t(
                    'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.warehouseDescription',
                )}
                disabled={disabled}
                {...form.getInputProps('credentials.warehouse')}
            />

            <TextInput
                required
                size="xs"
                label={t(
                    'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.schemaLabel',
                )}
                placeholder={t(
                    'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.schemaPlaceholder',
                )}
                description={t(
                    'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.schemaDescription',
                )}
                disabled={disabled}
                {...form.getInputProps('credentials.schema')}
            />

            <FormSection isOpen={isOpen} name="advanced">
                <Stack gap="xs" mt="xs">
                    <Switch
                        size="xs"
                        label={t(
                            'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.overrideLabel',
                        )}
                        description={t(
                            'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.overrideDescription',
                        )}
                        disabled={disabled}
                        {...form.getInputProps('credentials.override', {
                            type: 'checkbox',
                        })}
                    />

                    <Switch
                        size="xs"
                        label={t(
                            'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.requireUserCredentialsLabel',
                        )}
                        disabled={disabled}
                        {...form.getInputProps(
                            'credentials.requireUserCredentials',
                            {
                                type: 'checkbox',
                            },
                        )}
                    />

                    <Switch
                        size="xs"
                        label={t(
                            'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.clientSessionKeepAliveLabel',
                        )}
                        description={
                            <Trans
                                t={t}
                                i18nKey="organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.clientSessionKeepAliveDescription"
                                components={{
                                    docsLink: (
                                        <Anchor
                                            target="_blank"
                                            href="https://docs.getdbt.com/reference/warehouse-profiles/snowflake-profile#client_session_keep_alive"
                                            rel="noreferrer"
                                            fz="9"
                                        />
                                    ),
                                }}
                            />
                        }
                        disabled={disabled}
                        {...form.getInputProps(
                            'credentials.clientSessionKeepAlive',
                            {
                                type: 'checkbox',
                            },
                        )}
                    />

                    <TextInput
                        size="xs"
                        label={t(
                            'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.queryTagLabel',
                        )}
                        description={
                            <Trans
                                t={t}
                                i18nKey="organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.queryTagDescription"
                                components={{
                                    docsLink: (
                                        <Anchor
                                            target="_blank"
                                            href="https://docs.getdbt.com/reference/warehouse-profiles/snowflake-profile#query_tag"
                                            rel="noreferrer"
                                            fz="9"
                                        />
                                    ),
                                }}
                            />
                        }
                        disabled={disabled}
                        {...form.getInputProps('credentials.queryTag')}
                    />

                    <TextInput
                        size="xs"
                        label={t(
                            'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.accessUrlLabel',
                        )}
                        description={t(
                            'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.accessUrlDescription',
                        )}
                        disabled={disabled}
                        {...form.getInputProps('credentials.accessUrl')}
                    />

                    <Select
                        size="xs"
                        clearable
                        placeholder={t(
                            'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.startOfWeekPlaceholder',
                        )}
                        label={t(
                            'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.startOfWeekLabel',
                        )}
                        description={t(
                            'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.startOfWeekDescription',
                        )}
                        data={daysOfWeekOptions}
                        disabled={disabled}
                        {...form.getInputProps('credentials.startOfWeek')}
                        value={form.values.credentials?.startOfWeek?.toString()}
                        onChange={(value) =>
                            form.setFieldValue(
                                'credentials.startOfWeek',
                                value ? parseInt(value) : null,
                            )
                        }
                    />

                    <NumberInput
                        size="xs"
                        label={t(
                            'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.timeoutSecondsLabel',
                        )}
                        description={t(
                            'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.timeoutSecondsDescription',
                        )}
                        disabled={disabled}
                        {...form.getInputProps('credentials.timeoutSeconds')}
                    />
                </Stack>
            </FormSection>

            <FormCollapseButton isSectionOpen={isOpen} onClick={toggleOpen}>
                {t(
                    'organizationWarehouseCredentialsPanel.snowflakeCredentialsForm.advancedOptions',
                )}
            </FormCollapseButton>
        </Stack>
    );
};
