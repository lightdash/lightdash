import { ProjectType, ProjectTypeLabels } from 'common';
import React, { FC, useMemo } from 'react';
import { useWatch } from 'react-hook-form';
import { useApp } from '../../providers/AppProvider';
import SelectField from '../ReactHookForm/Select';
import DbtCloudForm from './DbtForms/DbtCloudForm';
import DbtLocalForm from './DbtForms/DbtLocalForm';
import GithubForm from './DbtForms/GithubForm';
import GitlabForm from './DbtForms/GitlabForm';

interface DbtSettingsFormProps {
    disabled: boolean;
    defaultType?: ProjectType;
}

const DbtSettingsForm: FC<DbtSettingsFormProps> = ({
    disabled,
    defaultType,
}) => {
    const type: ProjectType = useWatch({
        name: 'dbt.type',
        defaultValue: defaultType || ProjectType.GITHUB,
    });
    const { health } = useApp();
    const options = useMemo(() => {
        const enabledTypes = [ProjectType.GITHUB, ProjectType.GITLAB];
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
            case ProjectType.DBT:
                return <DbtLocalForm disabled={disabled} />;
            case ProjectType.DBT_CLOUD_IDE:
                return <DbtCloudForm disabled={disabled} />;
            case ProjectType.GITHUB:
                return <GithubForm disabled={disabled} />;
            case ProjectType.GITLAB:
                return <GitlabForm disabled={disabled} />;
            default: {
                const never: never = type;
                return null;
            }
        }
    }, [disabled, type]);

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
        </div>
    );
};

export default DbtSettingsForm;
