import { DbtProjectType } from '@lightdash/common';
import { Alert, Anchor, MultiSelect, Stack } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import React, { useCallback, useState, type FC } from 'react';
import { Controller } from 'react-hook-form';
import { hasNoWhiteSpaces } from '../../../utils/fieldValidators';
import MantineIcon from '../../common/MantineIcon';
import Input from '../../ReactHookForm/Input';
import PasswordInput from '../../ReactHookForm/PasswordInput';
import { useProjectFormContext } from '../useProjectFormContext';
import DbtVersionSelect from '../WarehouseForms/Inputs/DbtVersion';

const DbtCloudForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.DBT_CLOUD_IDE;

    const [search, setSearch] = useState('');
    const handleResetSearch = useCallback(() => {
        setTimeout(() => setSearch(() => ''), 0);
    }, [setSearch]);

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
                label="Service token"
                description={
                    <p>
                        The service token must have the "Metadata Only"
                        permission.
                    </p>
                }
                documentationUrl="https://docs.getdbt.com/docs/dbt-cloud-apis/service-tokens"
                rules={{
                    required: requireSecrets ? 'Required field' : undefined,
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('API key'),
                    },
                }}
                placeholder={
                    disabled || !requireSecrets ? '**************' : undefined
                }
                disabled={disabled}
            />
            <Input
                name="dbt.environment_id"
                label="Environment ID"
                description={
                    <p>
                        The unique identifier for the dbt production
                        environment, you can retrieve this from the dbt Cloud
                        URL when you navigate to Environments under Deploy.
                    </p>
                }
                documentationUrl="https://docs.getdbt.com/docs/dbt-cloud-apis/sl-jdbc#connection-parameters"
                rules={{
                    required: 'Required field',
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Environment ID'),
                    },
                }}
                disabled={disabled}
            />
            <Input
                name="dbt.discovery_api_endpoint"
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
                rules={{
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces(
                            'Discovery API endpoint',
                        ),
                    },
                }}
                placeholder={'https://metadata.cloud.getdbt.com/graphql'}
                disabled={disabled}
            />
            <Controller
                name="dbt.tags"
                render={({ field }) => (
                    <MultiSelect
                        {...field}
                        label="Tags"
                        disabled={disabled}
                        description={
                            <p>
                                Only models with <b>all</b> these tags will be
                                synced.
                            </p>
                        }
                        placeholder="e.g lightdash, prod"
                        searchable
                        searchValue={search}
                        onSearchChange={setSearch}
                        clearable
                        creatable
                        clearSearchOnChange
                        data={field.value || []}
                        getCreateLabel={(query) => `+ Add ${query}`}
                        onCreate={(query) => {
                            const newValue = [...(field.value || []), query];
                            field.onChange(newValue);
                            return query;
                        }}
                        onChange={field.onChange}
                        onKeyDown={(
                            event: React.KeyboardEvent<HTMLInputElement>,
                        ) => {
                            if (
                                event.key === 'Enter' &&
                                event.currentTarget.value.trim()
                            ) {
                                event.preventDefault(); // Prevent form submission
                                const newValue =
                                    event.currentTarget.value.trim();
                                if (!field.value?.includes(newValue)) {
                                    field.onChange([
                                        ...(field.value || []),
                                        newValue,
                                    ]);
                                    handleResetSearch();
                                }
                            }
                        }}
                        onDropdownClose={() => {
                            handleResetSearch();
                        }}
                    />
                )}
            />
        </Stack>
    );
};

export default DbtCloudForm;
