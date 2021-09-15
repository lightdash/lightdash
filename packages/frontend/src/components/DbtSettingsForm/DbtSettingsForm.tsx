import React, { FC, useEffect, useMemo, useState } from 'react';
import { FormGroup, HTMLSelect } from '@blueprintjs/core';
import { Project, ProjectType, ProjectTypeLabels } from 'common';
import DbtLocalForm from './DbtLocalForm';
import GithubForm from './GithubForm';
import DbtRemoteForm from './DbtRemoteForm';
import DbtCloudForm from './DbtCloudForm';
import { RefreshServerButton } from '../RefreshServerButton';
import GitlabForm from './GitlabForm';

interface DbtSettingsFormProps {
    dbtConnection: Project['dbtConnection'];
    onTypeChange: (value: ProjectType) => void;
}

const DbtSettingsForm: FC<DbtSettingsFormProps> = ({
    dbtConnection,
    onTypeChange,
}) => {
    const [type, setType] = useState<ProjectType>(dbtConnection.type);

    useEffect(() => {
        onTypeChange(type);
    }, [onTypeChange, type]);

    const form = useMemo(() => {
        switch (type) {
            case ProjectType.DBT:
                return (
                    <DbtLocalForm
                        disabled
                        values={
                            dbtConnection.type === type
                                ? dbtConnection
                                : undefined
                        }
                    />
                );
            case ProjectType.DBT_CLOUD_IDE:
                return (
                    <DbtCloudForm
                        disabled
                        values={
                            dbtConnection.type === type
                                ? dbtConnection
                                : undefined
                        }
                    />
                );
            case ProjectType.GITHUB:
                return (
                    <GithubForm
                        disabled
                        values={
                            dbtConnection.type === type
                                ? dbtConnection
                                : undefined
                        }
                    />
                );
            case ProjectType.DBT_REMOTE_SERVER:
                return (
                    <DbtRemoteForm
                        disabled
                        values={
                            dbtConnection.type === type
                                ? dbtConnection
                                : undefined
                        }
                    />
                );
            case ProjectType.GITLAB:
                return (
                    <GitlabForm
                        disabled
                        values={
                            dbtConnection.type === type
                                ? dbtConnection
                                : undefined
                        }
                    />
                );
            default: {
                const never: never = type;
                return null;
            }
        }
    }, [dbtConnection, type]);

    return (
        <div
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
            <FormGroup label="Type" labelFor="warehouse-type">
                <HTMLSelect
                    id="warehouse-type"
                    fill
                    value={type}
                    onChange={(e) =>
                        setType(e.currentTarget.value as ProjectType)
                    }
                    options={Object.entries(ProjectTypeLabels).map(
                        ([value, label]) => ({
                            value,
                            label,
                        }),
                    )}
                    disabled
                />
            </FormGroup>
            {form}
            <RefreshServerButton style={{ alignSelf: 'flex-end' }} />
        </div>
    );
};

export default DbtSettingsForm;
