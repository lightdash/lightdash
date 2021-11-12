import React, { FC } from 'react';
import { useQueryClient } from 'react-query';
import { Colors, Divider, H1 } from '@blueprintjs/core';
import { Redirect, useHistory, useParams } from 'react-router-dom';
import PageSpinner from '../components/PageSpinner';
import { useApp } from '../providers/AppProvider';
import ProjectTablesConfiguration from '../components/ProjectTablesConfiguration/ProjectTablesConfiguration';

const CreateProjectSettings: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const history = useHistory();
    const { health } = useApp();
    if (health.isLoading) {
        return <PageSpinner />;
    }

    if (
        health.status === 'success' &&
        (health.data?.needsSetup || !health.data?.needsProject)
    ) {
        return (
            <Redirect
                to={{
                    pathname: '/',
                }}
            />
        );
    }

    const onSuccess = async () => {
        await queryClient.invalidateQueries(['health']);
        history.push({
            pathname: `/projects/${projectUuid}`,
        });
    };

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                width: '800px',
                margin: '20px auto',
            }}
        >
            <H1 style={{ margin: 0, flex: 1 }}>Configure you tables</H1>
            <Divider style={{ margin: '20px 0' }} />
            <p style={{ marginBottom: 0, color: Colors.GRAY1 }}>
                Pick the dbt models you want to appear as tables in Lightdash
            </p>
            <p style={{ marginBottom: 20, color: Colors.GRAY1 }}>
                Can&apos;t decide? Don&apos;t worry, you can adjust this in your
                project settings later.
            </p>
            <ProjectTablesConfiguration
                projectUuid={projectUuid}
                onSuccess={onSuccess}
            />
        </div>
    );
};

export default CreateProjectSettings;
