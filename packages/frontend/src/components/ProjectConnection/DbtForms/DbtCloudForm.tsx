import { DbtProjectType } from '@lightdash/common';
import {
    TextInput,
    Alert,
    Anchor,
    Group,
    Stack,
    PasswordInput,
    Text,
} from '@mantine/core';
import { IconInfoCircle, IconPlus } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import useApp from '../../../providers/App/useApp';
import { CopyActionIcon } from '../../common/CopyActionIcon';
import MantineIcon from '../../common/MantineIcon';
import { MultiSelectCombobox } from '../../common/MultiSelectCombobox/MultiSelectCombobox';
import DocumentationHelpButton from '../../DocumentationHelpButton';
import { useFormContext } from '../formContext';
import DbtVersionSelect from '../Inputs/DbtVersion';
import { useProjectFormContext } from '../useProjectFormContext';

const DbtCloudForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { t } = useTranslation('projectConnection');
    const { health } = useApp();
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.DBT_CLOUD_IDE;

    const form = useFormContext();

    const dbtTagsField = form.getInputProps('dbt.tags');
    const dbtTags = dbtTagsField.value || [];
    const [tagsSearch, setTagsSearch] = useState('');

    const webhookUrl = savedProject?.projectUuid
        ? `${health?.data?.siteUrl}/api/v1/projects/${savedProject.projectUuid}/dbt-cloud/webhook`
        : undefined;

    return (
        <Stack>
            <DbtVersionSelect disabled={disabled} />

            <Alert
                icon={<MantineIcon icon={IconInfoCircle} size={'md'} />}
                title={t('dbtForms.cloud.requirements')}
            >
                <p>
                    <Trans
                        t={t}
                        i18nKey="dbtForms.cloud.generateDocs"
                        components={{ b: <b /> }}
                    />
                </p>
                <p>{t('dbtForms.cloud.refreshAfterJob')}</p>
            </Alert>
            <PasswordInput
                name="dbt.api_key"
                {...form.getInputProps('dbt.api_key')}
                label={t('dbtForms.cloud.serviceToken')}
                description={
                    <p>
                        {t('dbtForms.cloud.serviceTokenDescription')}
                        <DocumentationHelpButton href="https://docs.getdbt.com/docs/dbt-cloud-apis/service-tokens" />
                    </p>
                }
                required={requireSecrets}
                placeholder={
                    disabled || !requireSecrets ? '**************' : undefined
                }
                disabled={disabled}
            />
            <TextInput
                name="dbt.environment_id"
                {...form.getInputProps('dbt.environment_id')}
                label={t('dbtForms.cloud.environmentId')}
                description={
                    <p>
                        {t('dbtForms.cloud.environmentIdDescription')}
                        <DocumentationHelpButton href="https://docs.getdbt.com/docs/dbt-cloud-apis/sl-jdbc#connection-parameters" />
                    </p>
                }
                required
                disabled={disabled}
            />
            {webhookUrl && (
                <TextInput
                    label={t('dbtForms.cloud.webhook')}
                    description={
                        <p>
                            {t('dbtForms.cloud.webhookDescription')}
                            <DocumentationHelpButton href="https://docs.getdbt.com/docs/deploy/webhooks" />
                        </p>
                    }
                    value={webhookUrl}
                    readOnly
                    rightSectionPointerEvents="all"
                    rightSection={
                        <CopyActionIcon
                            value={webhookUrl}
                            tooltipPosition="left"
                            aria-label={t('dbtForms.cloud.copyWebhook')}
                            onMouseDown={(event) => event.preventDefault()}
                        />
                    }
                />
            )}
            <PasswordInput
                name="dbt.webhook_hmac_secret"
                {...form.getInputProps('dbt.webhook_hmac_secret')}
                label={t('dbtForms.cloud.webhookSecret')}
                description={
                    <p>
                        {t('dbtForms.cloud.webhookSecretDescription')}
                        <DocumentationHelpButton href="https://docs.getdbt.com/docs/deploy/webhooks#validate-a-webhook" />
                    </p>
                }
                placeholder={
                    disabled || !requireSecrets ? '**************' : undefined
                }
                disabled={disabled}
            />
            <TextInput
                name="dbt.discovery_api_endpoint"
                {...form.getInputProps('dbt.discovery_api_endpoint')}
                label={t('dbtForms.cloud.discoveryEndpoint')}
                description={
                    <p>
                        <Trans
                            t={t}
                            i18nKey="dbtForms.cloud.discoveryEndpointDescription"
                            components={{
                                docsLink: (
                                    <Anchor
                                        inherit
                                        target="_blank"
                                        href="https://docs.getdbt.com/docs/dbt-cloud-apis/discovery-querying#discovery-api-endpoints"
                                        rel="noreferrer"
                                    />
                                ),
                            }}
                        />
                    </p>
                }
                placeholder="https://metadata.cloud.getdbt.com/graphql"
                disabled={disabled}
            />
            <MultiSelectCombobox
                name="dbt.tags"
                label={t('dbtForms.cloud.tags')}
                disabled={disabled}
                error={dbtTagsField.error}
                description={
                    <p>
                        <Trans
                            t={t}
                            i18nKey="dbtForms.cloud.tagsDescription"
                            components={{ b: <b /> }}
                        />
                    </p>
                }
                placeholder={t('dbtForms.cloud.tagsPlaceholder')}
                options={dbtTags.map((tag: string) => ({
                    value: tag,
                    label: tag,
                }))}
                value={dbtTags}
                hidePickedOptions
                searchValue={tagsSearch}
                onSearchChange={setTagsSearch}
                onBlur={dbtTagsField.onBlur}
                onDropdownClose={() => setTagsSearch('')}
                onValueRemove={(tag) => {
                    form.setFieldValue(
                        'dbt.tags',
                        dbtTags.filter((value: string) => value !== tag),
                    );
                }}
                onOptionSubmit={(tag) => {
                    form.setFieldValue(
                        'dbt.tags',
                        dbtTags.filter((value: string) => value !== tag),
                    );
                }}
                onClear={() => {
                    form.setFieldValue('dbt.tags', []);
                    setTagsSearch('');
                }}
                onCreate={(tag) => {
                    form.setFieldValue('dbt.tags', [...dbtTags, tag]);
                    setTagsSearch('');
                }}
                shouldCreate={(query) =>
                    query.trim().length > 0 && !dbtTags.includes(query.trim())
                }
                createLabel={
                    <Group gap="xxs">
                        <MantineIcon icon={IconPlus} color="blue.7" size="sm" />
                        <Text c="blue.7" fz="sm" fw={500}>
                            {t('dbtForms.cloud.addTag', {
                                tag: tagsSearch.trim(),
                            })}
                        </Text>
                    </Group>
                }
            />
        </Stack>
    );
};

export default DbtCloudForm;
