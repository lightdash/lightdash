import {
    assertUnreachable,
    DbtProjectType,
    DbtProjectTypeLabels,
    WarehouseTypes,
} from '@lightdash/common';
import { Anchor, Select, Stack, TextInput } from '@mantine/core';
import { useMemo, useState, type FC } from 'react';
import useApp from '../../providers/App/useApp';
import AzureDevOpsForm from './DbtForms/AzureDevOpsForm';
import BitBucketForm from './DbtForms/BitBucketForm';
import DbtCloudForm from './DbtForms/DbtCloudForm';
import DbtLocalForm from './DbtForms/DbtLocalForm';
import DbtManifestForm from './DbtForms/DbtManifestForm';
import DbtNoneForm from './DbtForms/DbtNoneForm';
import GithubForm from './DbtForms/GithubForm';
import GitlabForm from './DbtForms/GitlabForm';
import { dbtDefaults } from './DbtForms/defaultValues';
import FormCollapseButton from './FormCollapseButton';
import FormSection from './Inputs/FormSection';
import { MultiKeyValuePairsInput } from './Inputs/MultiKeyValuePairsInput';
import { BigQuerySchemaInput } from './WarehouseForms/BigQueryForm';
import { ClickhouseSchemaInput } from './WarehouseForms/ClickhouseForm';
import { DatabricksSchemaInput } from './WarehouseForms/DatabricksForm';
import { PostgresSchemaInput } from './WarehouseForms/PostgresForm';
import { RedshiftSchemaInput } from './WarehouseForms/RedshiftForm';
import { SnowflakeSchemaInput } from './WarehouseForms/SnowflakeForm';
import { TrinoSchemaInput } from './WarehouseForms/TrinoForm';
import { useFormContext } from './formContext';

interface DbtSettingsFormProps {
    disabled: boolean;
    defaultType?: DbtProjectType;
}

const DbtSettingsForm: FC<DbtSettingsFormProps> = ({
    disabled,
    defaultType,
}) => {
    const form = useFormContext();
    const selectedWarehouse = form.values.warehouse?.type;

    const type: DbtProjectType =
        form.values.dbt.type ?? (defaultType || DbtProjectType.GITHUB);

    const warehouseType: WarehouseTypes =
        form.values.warehouse?.type ??
        selectedWarehouse ??
        WarehouseTypes.BIGQUERY;

    const [isAdvancedSettingsOpen, setIsAdvancedSettingsOpen] =
        useState<boolean>(false);
    const toggleAdvancedSettingsOpen = () =>
        setIsAdvancedSettingsOpen((open) => !open);
    const { health } = useApp();
    const options = useMemo(() => {
        const enabledTypes = [
            DbtProjectType.GITHUB,
            DbtProjectType.GITLAB,
            DbtProjectType.BITBUCKET,
            DbtProjectType.AZURE_DEVOPS,
            DbtProjectType.NONE,
            DbtProjectType.MANIFEST,
            DbtProjectType.DBT_CLOUD_IDE,
        ];
        if (health.data?.localDbtEnabled) {
            enabledTypes.push(DbtProjectType.DBT);
        }

        return enabledTypes.map((value) => ({
            value,
            label: DbtProjectTypeLabels[value],
        }));
    }, [health]);

    const DbtForm = useMemo(() => {
        switch (type) {
            case DbtProjectType.DBT:
                return DbtLocalForm;
            case DbtProjectType.DBT_CLOUD_IDE:
                return DbtCloudForm;
            case DbtProjectType.GITHUB:
                return GithubForm;
            case DbtProjectType.GITLAB:
                return GitlabForm;
            case DbtProjectType.BITBUCKET:
                return BitBucketForm;
            case DbtProjectType.AZURE_DEVOPS:
                return AzureDevOpsForm;
            case DbtProjectType.NONE:
                return DbtNoneForm;
            case DbtProjectType.MANIFEST:
                return DbtManifestForm;
            default: {
                return assertUnreachable(
                    type,
                    `Unknown dbt project type ${type}`,
                );
            }
        }
    }, [type]);

    const baseDocUrl =
        'https://docs.lightdash.com/get-started/setup-lightdash/connect-project#';
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
        [DbtProjectType.MANIFEST]: {
            env: `environment-variables-3`,
        },
    };

    const WarehouseSchemaInput = useMemo(() => {
        switch (warehouseType) {
            case WarehouseTypes.BIGQUERY:
                return BigQuerySchemaInput;
            case WarehouseTypes.POSTGRES:
                return PostgresSchemaInput;
            case WarehouseTypes.TRINO:
                return TrinoSchemaInput;
            case WarehouseTypes.REDSHIFT:
                return RedshiftSchemaInput;
            case WarehouseTypes.SNOWFLAKE:
                return SnowflakeSchemaInput;
            case WarehouseTypes.DATABRICKS:
                return DatabricksSchemaInput;
            case WarehouseTypes.CLICKHOUSE:
                return ClickhouseSchemaInput;
            default: {
                return assertUnreachable(
                    warehouseType,
                    `Unknown warehouse type ${warehouseType}`,
                );
            }
        }
    }, [warehouseType]);

    return (
        <div
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
            <Stack style={{ marginTop: '8px' }}>
                <Select
                    name="dbt.type"
                    {...form.getInputProps('dbt.type')}
                    onChange={(value: DbtProjectType) => {
                        form.getInputProps('dbt.type').onChange(value);
                        if (value) {
                            form.setValues({
                                dbt: dbtDefaults.formValues[value],
                            });
                        }
                    }}
                    defaultValue={DbtProjectType.GITHUB}
                    label="Type"
                    data={options}
                    required
                    disabled={disabled}
                />

                <DbtForm disabled={disabled} />

                {type !== DbtProjectType.NONE && (
                    <>
                        <FormSection name="target">
                            <Stack style={{ marginTop: '8px' }}>
                                <TextInput
                                    name="dbt.target"
                                    {...form.getInputProps('dbt.target')}
                                    label="Target name"
                                    description={
                                        <p>
                                            <b>target</b> is the dataset/schema
                                            in your data warehouse that
                                            Lightdash will look for your dbt
                                            models. By default, we set this to
                                            be the same value as you have as the
                                            default in your profiles.yml file.
                                        </p>
                                    }
                                    disabled={disabled}
                                    placeholder="prod"
                                />
                                {/* This WarehouseSchemaInput extra options will be provided in the organization warehouse credentials form */}
                                {form.values
                                    .organizationWarehouseCredentialsUuid ? null : (
                                    <WarehouseSchemaInput disabled={disabled} />
                                )}
                            </Stack>
                        </FormSection>
                        <FormSection
                            name="Advanced"
                            isOpen={isAdvancedSettingsOpen}
                        >
                            <Stack style={{ marginTop: '8px' }}>
                                {type !== DbtProjectType.DBT_CLOUD_IDE && (
                                    <TextInput
                                        name="dbt.selector"
                                        {...form.getInputProps('dbt.selector')}
                                        label="dbt selector"
                                        description={
                                            <p>
                                                Add dbt selectors to filter out
                                                models from your dbt project.
                                                You can see more details in{' '}
                                                <Anchor
                                                    href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project/#dbt-selector"
                                                    target="_blank"
                                                    rel="noreferrer"
                                                >
                                                    our docs
                                                </Anchor>
                                                .
                                            </p>
                                        }
                                        disabled={disabled}
                                        placeholder="tag:lightdash"
                                    />
                                )}

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
