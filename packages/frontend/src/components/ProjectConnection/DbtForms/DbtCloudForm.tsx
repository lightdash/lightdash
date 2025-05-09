import { DbtProjectType } from '@lightdash/common';
import {
    Alert,
    Anchor,
    MultiSelect,
    PasswordInput,
    Stack,
    TextInput,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
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
                        The service token must have the "Metadata Only"
                        permission.
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
            {savedProject?.projectUuid && (
                <TextInput
                    label="Webhook for dbt"
                    value={`${health?.data?.siteUrl}/api/v1/projects/${savedProject?.projectUuid}/dbt-cloud/webhook`}
                    readOnly
                />
            )}
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
