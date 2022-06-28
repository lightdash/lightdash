import {
    ProjectType,
    ProjectTypeLabels,
    WarehouseTypes,
} from '@lightdash/common';
import { FC, useMemo, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { useApp } from '../../providers/AppProvider';
import FormSection from '../ReactHookForm/FormSection';
import Input from '../ReactHookForm/Input';
import { MultiKeyValuePairsInput } from '../ReactHookForm/MultiKeyValuePairsInput';
import SelectField from '../ReactHookForm/Select';
import AzureDevOpsForm from './DbtForms/AzureDevOpsForm';
import BitBucketForm from './DbtForms/BitBucketForm';
import DbtCloudForm from './DbtForms/DbtCloudForm';
import DbtLocalForm from './DbtForms/DbtLocalForm';
import GithubForm from './DbtForms/GithubForm';
import GitlabForm from './DbtForms/GitlabForm';
import { SelectedWarehouse } from './ProjectConnectFlow/WareHouseConnectCard.tsx';
import {
    AdvancedButton,
    AdvancedButtonWrapper,
} from './ProjectConnection.styles';
import { BigQuerySchemaInput } from './WarehouseForms/BigQueryForm';
import { DatabricksSchemaInput } from './WarehouseForms/DatabricksForm';
import { PostgresSchemaInput } from './WarehouseForms/PostgresForm';
import { RedshiftSchemaInput } from './WarehouseForms/RedshiftForm';
import { SnowflakeSchemaInput } from './WarehouseForms/SnowflakeForm';

interface DbtSettingsFormProps {
    disabled: boolean;
    defaultType?: ProjectType;
    selectedWarehouse?: SelectedWarehouse | undefined;
}

const DbtSettingsForm: FC<DbtSettingsFormProps> = ({
    disabled,
    defaultType,
    selectedWarehouse,
}) => {
    const type: ProjectType = useWatch({
        name: 'dbt.type',
        defaultValue: defaultType || ProjectType.GITHUB,
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
    const options = useMemo(() => {
        const enabledTypes = [
            ProjectType.GITHUB,
            ProjectType.GITLAB,
            ProjectType.BITBUCKET,
            ProjectType.AZURE_DEVOPS,
        ];
        if (health.data?.localDbtEnabled) {
            enabledTypes.push(ProjectType.DBT);
        }
        if (type === ProjectType.DBT_CLOUD_IDE) {
            enabledTypes.push(ProjectType.DBT_CLOUD_IDE);
        }

        return enabledTypes.map((value) => ({
            value,
            label: ProjectTypeLabels[value],
        }));
    }, [health, type]);

    const form = useMemo(() => {
        switch (type) {
            case ProjectType.PREVIEW:
                return null;
            case ProjectType.DBT:
                return <DbtLocalForm />;
            case ProjectType.DBT_CLOUD_IDE:
                return <DbtCloudForm disabled={disabled} />;
            case ProjectType.GITHUB:
                return <GithubForm disabled={disabled} />;
            case ProjectType.GITLAB:
                return <GitlabForm disabled={disabled} />;
            case ProjectType.BITBUCKET:
                return <BitBucketForm disabled={disabled} />;
            case ProjectType.AZURE_DEVOPS:
                return <AzureDevOpsForm disabled={disabled} />;
            default: {
                const never: never = type;
                return null;
            }
        }
    }, [disabled, type]);

    const baseDocUrl =
        'https://docs.lightdash.com/get-started/setup-lightdash/connect-project#';
    const typeDocUrls = {
        [ProjectType.GITHUB]: {
            target: `target-name`,
            env: `environment-variables`,
        },
        [ProjectType.GITLAB]: {
            target: `target-name-1`,
            env: `environment-variables-1`,
        },
        [ProjectType.AZURE_DEVOPS]: {
            target: `target-name-2`,
            env: `environment-variables-2`,
        },
        [ProjectType.DBT]: {
            target: `target-name-3`,
            env: `environment-variables-3`,
        },
        [ProjectType.BITBUCKET]: {
            target: `target-name-3`,
            env: `environment-variables-3`,
        },
        [ProjectType.DBT_CLOUD_IDE]: {
            target: `target-name`,
            env: `environment-variables`,
        },
        [ProjectType.PREVIEW]: {
            target: '',
            env: '',
        },
    };

    const warehouseSchemaInput = useMemo(() => {
        switch (selectedWarehouse?.key || warehouseType) {
            case WarehouseTypes.BIGQUERY:
                return <BigQuerySchemaInput disabled={disabled} />;
            case WarehouseTypes.POSTGRES:
                return <PostgresSchemaInput disabled={disabled} />;
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
            <SelectField
                name="dbt.type"
                label="Type"
                options={options}
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
                defaultValue={ProjectType.GITHUB}
            />
            {form}
            <FormSection name="target">
                <Input
                    name="dbt.target"
                    label="Target name"
                    documentationUrl={`${baseDocUrl}${typeDocUrls[type].target}`}
                    disabled={disabled}
                    placeholder="prod"
                />
                {warehouseSchemaInput}
            </FormSection>
            <FormSection name={'Advanced'} isOpen={isAdvancedSettingsOpen}>
                <MultiKeyValuePairsInput
                    name="dbt.environment"
                    label="Environment variables"
                    documentationUrl={`${baseDocUrl}${typeDocUrls[type].env}`}
                    disabled={disabled}
                />
                <></>
            </FormSection>
            <AdvancedButtonWrapper>
                <AdvancedButton
                    icon={
                        isAdvancedSettingsOpen ? 'chevron-up' : 'chevron-down'
                    }
                    text={`Advanced configuration options`}
                    onClick={toggleAdvancedSettingsOpen}
                />
            </AdvancedButtonWrapper>
        </div>
    );
};

export default DbtSettingsForm;
