import {
    assertUnreachable,
    DbtProjectType,
    DbtProjectTypeLabels,
    DefaultSupportedDbtVersion,
    FeatureFlags,
    SupportedDbtVersions,
    WarehouseTypes,
} from '@lightdash/common';
import { Select, Stack, TextInput } from '@mantine/core';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import { useEffect, useMemo, useState, type FC } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { useApp } from '../../providers/AppProvider';
import FormSection from '../ReactHookForm/FormSection';
import { MultiKeyValuePairsInput } from '../ReactHookForm/MultiKeyValuePairsInput';
import AzureDevOpsForm from './DbtForms/AzureDevOpsForm';
import BitBucketForm from './DbtForms/BitBucketForm';
import DbtCloudForm from './DbtForms/DbtCloudForm';
import DbtLocalForm from './DbtForms/DbtLocalForm';
import DbtNoneForm from './DbtForms/DbtNoneForm';
import GithubForm from './DbtForms/GithubForm';
import GitlabForm from './DbtForms/GitlabForm';
import FormCollapseButton from './FormCollapseButton';
import { type SelectedWarehouse } from './ProjectConnectFlow/SelectWarehouse';
import { BigQuerySchemaInput } from './WarehouseForms/BigQueryForm';
import { DatabricksSchemaInput } from './WarehouseForms/DatabricksForm';
import { PostgresSchemaInput } from './WarehouseForms/PostgresForm';
import { RedshiftSchemaInput } from './WarehouseForms/RedshiftForm';
import { SnowflakeSchemaInput } from './WarehouseForms/SnowflakeForm';
import { TrinoSchemaInput } from './WarehouseForms/TrinoForm';

interface DbtSettingsFormProps {
    disabled: boolean;
    defaultType?: DbtProjectType;
    selectedWarehouse?: SelectedWarehouse | undefined;
}

const DbtSettingsForm: FC<DbtSettingsFormProps> = ({
    disabled,
    defaultType,
    selectedWarehouse,
}) => {
    const { resetField, register, unregister } = useFormContext();
    const type: DbtProjectType = useWatch({
        name: 'dbt.type',
        defaultValue: defaultType || DbtProjectType.GITHUB,
    });
    const warehouseType: WarehouseTypes = useWatch({
        name: 'warehouse.type',
        defaultValue: WarehouseTypes.BIGQUERY,
    });
    const [isAdvancedSettingsOpen, setIsAdvancedSettingsOpen] =
        useState<boolean>(false);
    const toggleAdvancedSettingsOpen = () =>
        setIsAdvancedSettingsOpen((open) => !open);
    const { health } = useApp();
    const isEnabled = useFeatureFlagEnabled(
        FeatureFlags.ShowDbtCloudProjectOption,
    );
    const options = useMemo(() => {
        const enabledTypes = [
            DbtProjectType.GITHUB,
            DbtProjectType.GITLAB,
            DbtProjectType.BITBUCKET,
            DbtProjectType.AZURE_DEVOPS,
            DbtProjectType.NONE,
        ];
        if (health.data?.localDbtEnabled) {
            enabledTypes.push(DbtProjectType.DBT);
        }
        if (isEnabled || type === DbtProjectType.DBT_CLOUD_IDE) {
            enabledTypes.push(DbtProjectType.DBT_CLOUD_IDE);
        }

        return enabledTypes.map((value) => ({
            value,
            label: DbtProjectTypeLabels[value],
        }));
    }, [isEnabled, health, type]);

    useEffect(() => {
        // Reset field validation from github form
        unregister('dbt.personal_access_token');
    }, [type, unregister]);

    const form = useMemo(() => {
        resetField('dbt.host_domain');
        switch (type) {
            case DbtProjectType.DBT:
                return <DbtLocalForm />;
            case DbtProjectType.DBT_CLOUD_IDE:
                return <DbtCloudForm disabled={disabled} />;
            case DbtProjectType.GITHUB:
                return <GithubForm disabled={disabled} />;
            case DbtProjectType.GITLAB:
                return <GitlabForm disabled={disabled} />;
            case DbtProjectType.BITBUCKET:
                return <BitBucketForm disabled={disabled} />;
            case DbtProjectType.AZURE_DEVOPS:
                return <AzureDevOpsForm disabled={disabled} />;
            case DbtProjectType.NONE:
                return <DbtNoneForm disabled={disabled} />;
            default: {
                return assertUnreachable(
                    type,
                    `Unknown dbt project type ${type}`,
                );
            }
        }
    }, [disabled, type, resetField]);
    const baseDocUrl = `${health.data?.siteHelpdeskUrl}/get-started/setup-lightdash/connect-project#`;
    const typeDocUrls = {
        [DbtProjectType.GITHUB]: {
            env: `environment-variables`,
        },
        [DbtProjectType.GITLAB]: {
            env: `environment-variables-1`,
        },
        [DbtProjectType.AZURE_DEVOPS]: {
            env: `environment-variables-2`,
        },
        [DbtProjectType.DBT]: {
            env: `environment-variables-3`,
        },
        [DbtProjectType.BITBUCKET]: {
            env: `environment-variables-3`,
        },
        [DbtProjectType.DBT_CLOUD_IDE]: {
            env: `environment-variables`,
        },
        [DbtProjectType.NONE]: {
            env: `environment-variables-3`,
        },
    };

    const warehouseSchemaInput = useMemo(() => {
        switch (selectedWarehouse || warehouseType) {
            case WarehouseTypes.BIGQUERY:
                return <BigQuerySchemaInput disabled={disabled} />;
            case WarehouseTypes.POSTGRES:
                return <PostgresSchemaInput disabled={disabled} />;
            case WarehouseTypes.TRINO:
                return <TrinoSchemaInput disabled={disabled} />;
            case WarehouseTypes.REDSHIFT:
                return <RedshiftSchemaInput disabled={disabled} />;
            case WarehouseTypes.SNOWFLAKE:
                return <SnowflakeSchemaInput disabled={disabled} />;
            case WarehouseTypes.DATABRICKS:
                return <DatabricksSchemaInput disabled={disabled} />;
            default: {
                return <></>;
            }
        }
    }, [disabled, warehouseType, selectedWarehouse]);
    return (
        <div
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
            <Stack style={{ marginTop: '8px' }}>
                <Controller
                    name="dbt.type"
                    defaultValue={DbtProjectType.GITHUB}
                    render={({ field }) => (
                        <Select
                            label="Type"
                            data={options}
                            required
                            name={field.name}
                            value={field.value}
                            onChange={field.onChange}
                            disabled={disabled}
                        />
                    )}
                />
                <Controller
                    name="dbtVersion"
                    defaultValue={DefaultSupportedDbtVersion}
                    render={({ field }) => (
                        <Select
                            label="dbt version"
                            data={Object.values(SupportedDbtVersions).map(
                                (version) => ({
                                    value: version,
                                    label: version,
                                }),
                            )}
                            value={field.value}
                            onChange={field.onChange}
                            disabled={disabled}
                        />
                    )}
                />
                {form}
                {type !== DbtProjectType.NONE && (
                    <>
                        <FormSection name="target">
                            <Stack style={{ marginTop: '8px' }}>
                                <TextInput
                                    {...register('dbt.target')}
                                    label="Target name"
                                    description={
                                        <p>
                                            <b>target</b> is the dataset/schema
                                            in your data warehouse that the
                                            application will look for your dbt
                                            models. By default, we set this to
                                            be the same value as you have as the
                                            default in your profiles.yml file.
                                        </p>
                                    }
                                    disabled={disabled}
                                    placeholder="prod"
                                />
                                {warehouseSchemaInput}
                            </Stack>
                        </FormSection>
                        <FormSection
                            name="Advanced"
                            isOpen={isAdvancedSettingsOpen}
                        >
                            <Stack style={{ marginTop: '8px' }}>
                                <MultiKeyValuePairsInput
                                    name="dbt.environment"
                                    label="Environment variables"
                                    documentationUrl={`${baseDocUrl}${typeDocUrls[type].env}`}
                                    disabled={disabled}
                                />
                            </Stack>
                        </FormSection>
                        <FormCollapseButton
                            isSectionOpen={isAdvancedSettingsOpen}
                            onClick={toggleAdvancedSettingsOpen}
                        >
                            Advanced configuration options
                        </FormCollapseButton>
                    </>
                )}
            </Stack>
        </div>
    );
};

export default DbtSettingsForm;
