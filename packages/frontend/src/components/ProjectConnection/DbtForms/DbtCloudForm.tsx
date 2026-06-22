import { DbtProjectType } from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Anchor,
    CopyButton,
    MultiSelect,
    PasswordInput,
    Stack,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconCheck, IconCopy, IconInfoCircle } from '@tabler/icons-react';
import React, { useCallback, useState, type FC } from 'react';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import DocumentationHelpButton from '../../DocumentationHelpButton';
import { useFormContext } from '../formContext';
import DbtVersionSelect from '../Inputs/DbtVersion';
import { useProjectFormContext } from '../useProjectFormContext';

const DbtCloudForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { health } = useApp();
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.DBT_CLOUD_IDE;

    const [search, setSearch] = useState('');
    const handleResetSearch = useCallback(() => {
        setTimeout(() => setSearch(() => ''), 0);
    }, [setSearch]);

    const form = useFormContext();

    const dbtTagsField = form.getInputProps('dbt.tags');

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
                    rightSection={
                        <CopyButton value={webhookUrl}>
                            {({ copied, copy }) => (
                                <Tooltip
                                    label={copied ? 'Copied' : 'Copy'}
                                    withArrow
                                    position="left"
                                >
                                    <ActionIcon
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
            <MultiSelect
                name="dbt.tags"
                {...form.getInputProps('dbt.tags')}
                {...dbtTagsField}
                label="Tags"
                disabled={disabled}
                description={
                    <p>
                        Only models with <b>all</b> these tags will be synced.
                    </p>
                }
                placeholder="e.g lightdash, prod"
                searchable
                searchValue={search}
                onSearchChange={setSearch}
                clearable
                creatable
                clearSearchOnChange
                data={dbtTagsField.value || []}
                getCreateLabel={(query) => `+ Add ${query}`}
                onCreate={(query) => {
                    form.insertListItem('dbt.tags', query);
                    return query;
                }}
                onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                    if (
                        event.key === 'Enter' &&
                        event.currentTarget.value.trim()
                    ) {
                        event.preventDefault(); // Prevent form submission
                        if (
                            !dbtTagsField.value.includes(
                                event.currentTarget.value.trim(),
                            )
                        ) {
                            form.insertListItem(
                                'dbt.tags',
                                event.currentTarget.value.trim(),
                            );
                            handleResetSearch();
                        }
                    }
                }}
                onDropdownClose={() => {
                    handleResetSearch();
                }}
            />
        </Stack>
    );
};

export default DbtCloudForm;
