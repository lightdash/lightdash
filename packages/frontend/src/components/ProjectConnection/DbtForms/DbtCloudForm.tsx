import { DbtProjectType } from '@lightdash/common';
import {
    TextInput,
    ActionIcon,
    Alert,
    Anchor,
    CopyButton,
    Group,
    Stack,
    PasswordInput,
    Text,
    Tooltip,
} from '@mantine-8/core';
import {
    IconCheck,
    IconCopy,
    IconInfoCircle,
    IconPlus,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import { MultiSelectCombobox } from '../../common/MultiSelectCombobox/MultiSelectCombobox';
import DocumentationHelpButton from '../../DocumentationHelpButton';
import { useFormContext } from '../formContext';
import DbtVersionSelect from '../Inputs/DbtVersion';
import { useProjectFormContext } from '../useProjectFormContext';

const DbtCloudForm: FC<{ disabled: boolean }> = ({ disabled }) => {
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
                title="Requirements"
                variant="light"
            >
                <p>
                    The dbt job that builds your project must{' '}
                    <b>generate docs</b>.
                </p>
                <p>
                    After your job finish you need to click the "refresh dbt"
                    button in Lightdash to sync your project.
                </p>
            </Alert>
            <PasswordInput
                name="dbt.api_key"
                {...form.getInputProps('dbt.api_key')}
                label="Service token"
                description={
                    <p>
                        Needs the "Metadata Only" and "Job Viewer" permissions.
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
                label="Environment ID"
                description={
                    <p>
                        The unique identifier for the dbt production
                        environment, you can retrieve this from the dbt Cloud
                        URL when you navigate to Environments under Deploy.
                        <DocumentationHelpButton href="https://docs.getdbt.com/docs/dbt-cloud-apis/sl-jdbc#connection-parameters" />
                    </p>
                }
                required
                disabled={disabled}
            />
            {webhookUrl && (
                <TextInput
                    label="Webhook for dbt"
                    description={
                        <p>
                            Add this URL as a webhook in dbt Cloud (triggered on
                            job completion) so Lightdash can build a preview
                            when your dbt job finishes.
                            <DocumentationHelpButton href="https://docs.getdbt.com/docs/deploy/webhooks" />
                        </p>
                    }
                    value={webhookUrl}
                    readOnly
                    rightSectionPointerEvents="all"
                    rightSection={
                        <CopyButton value={webhookUrl}>
                            {({ copied, copy }) => (
                                <Tooltip
                                    label={copied ? 'Copied' : 'Copy'}
                                    withArrow
                                    position="left"
                                >
                                    <ActionIcon
                                        aria-label="Copy webhook URL"
                                        onMouseDown={(event) =>
                                            event.preventDefault()
                                        }
                                        variant="subtle"
                                        color={copied ? 'teal' : 'gray'}
                                        onClick={copy}
                                    >
                                        <MantineIcon
                                            icon={copied ? IconCheck : IconCopy}
                                        />
                                    </ActionIcon>
                                </Tooltip>
                            )}
                        </CopyButton>
                    }
                />
            )}
            <PasswordInput
                name="dbt.webhook_hmac_secret"
                {...form.getInputProps('dbt.webhook_hmac_secret')}
                label="Webhook secret"
                description={
                    <p>
                        Recommended if you use the dbt webhook above. Paste the
                        secret that dbt Cloud generated for the webhook so
                        Lightdash can verify that incoming requests are genuine.
                        Without it, webhook requests cannot be authenticated.
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
                label="Discovery API endpoint"
                description={
                    <p>
                        Use the endpoint that's appropriate for your{' '}
                        <Anchor
                            inherit
                            target="_blank"
                            href="https://docs.getdbt.com/docs/dbt-cloud-apis/discovery-querying#discovery-api-endpoints"
                            rel="noreferrer"
                        >
                            region and plan
                        </Anchor>
                        .
                    </p>
                }
                placeholder="https://metadata.cloud.getdbt.com/graphql"
                disabled={disabled}
            />
            <MultiSelectCombobox
                name="dbt.tags"
                label="Tags"
                disabled={disabled}
                error={dbtTagsField.error}
                description={
                    <p>
                        Only models with <b>all</b> these tags will be synced.
                    </p>
                }
                placeholder="e.g lightdash, prod"
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
                            Add "{tagsSearch.trim()}"
                        </Text>
                    </Group>
                }
            />
        </Stack>
    );
};

export default DbtCloudForm;
