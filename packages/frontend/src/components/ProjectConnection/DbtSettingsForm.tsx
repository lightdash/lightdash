import {
    DbtProjectType,
    DbtProjectTypeLabels,
    WarehouseTypes,
} from '@lightdash/common';
import { FC, useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
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
    defaultType?: DbtProjectType;
    selectedWarehouse?: SelectedWarehouse | undefined;
}

const DbtSettingsForm: FC<DbtSettingsFormProps> = ({
    disabled,
    defaultType,
    selectedWarehouse,
}) => {
    const { resetField } = useFormContext();
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
    const options = useMemo(() => {
        const enabledTypes = [
            DbtProjectType.GITHUB,
            DbtProjectType.GITLAB,
            DbtProjectType.BITBUCKET,
            DbtProjectType.AZURE_DEVOPS,
        ];
        if (health.data?.localDbtEnabled) {
            enabledTypes.push(DbtProjectType.DBT);
        }
        if (type === DbtProjectType.DBT_CLOUD_IDE) {
            enabledTypes.push(DbtProjectType.DBT_CLOUD_IDE);
        }

        return enabledTypes.map((value) => ({
            value,
            label: DbtProjectTypeLabels[value],
        }));
    }, [health, type]);

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
            default: {
                const never: never = type;
                return null;
            }
        }
    }, [disabled, type, resetField]);

    const baseDocUrl =
        'https://docs.lightdash.com/get-started/setup-lightdash/connect-project#';
    const typeDocUrls = {
        [DbtProjectType.GITHUB]: {
            target: `target-name`,
            env: `environment-variables`,
        },
        [DbtProjectType.GITLAB]: {
            target: `target-name-1`,
            env: `environment-variables-1`,
        },
        [DbtProjectType.AZURE_DEVOPS]: {
            target: `target-name-2`,
            env: `environment-variables-2`,
        },
        [DbtProjectType.DBT]: {
            target: `target-name-3`,
            env: `environment-variables-3`,
        },
        [DbtProjectType.BITBUCKET]: {
            target: `target-name-3`,
            env: `environment-variables-3`,
        },
        [DbtProjectType.DBT_CLOUD_IDE]: {
            target: `target-name`,
            env: `environment-variables`,
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
                defaultValue={DbtProjectType.GITHUB}
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
