import React, { FC, useMemo } from 'react';
import { ProjectType, ProjectTypeLabels } from 'common';

import DbtLocalForm from './DbtForms/DbtLocalForm';
import GithubForm from './DbtForms/GithubForm';
import DbtCloudForm from './DbtForms/DbtCloudForm';
import GitlabForm from './DbtForms/GitlabForm';
import SelectField from '../ReactHookForm/Select';
import { useApp } from '../../providers/AppProvider';

interface DbtSettingsFormProps {
    disabled: boolean;
    type: ProjectType;
}

const DbtSettingsForm: FC<DbtSettingsFormProps> = ({ disabled, type }) => {
    const { health } = useApp();

    const options = useMemo(() => {
        const enabledTypes = [ProjectType.GITHUB, ProjectType.GITLAB];
        if (health.data?.localDbtEnabled) {
            enabledTypes.push(ProjectType.DBT);
        }

        return enabledTypes.map((value) => ({
            value,
            label: ProjectTypeLabels[value],
        }));
    }, [health]);

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
