import { Divider, H1 } from '@blueprintjs/core';
import React, { FC } from 'react';
import { Redirect } from 'react-router-dom';
import PageSpinner from '../components/PageSpinner';
import { CreateProjectConnection } from '../components/ProjectConnection';
import { useApp } from '../providers/AppProvider';

const CreateProject: FC = () => {
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

    if (health.status === 'success' && !health.data?.isAuthenticated) {
        return (
            <Redirect
                to={{
                    pathname: '/login',
                }}
            />
        );
    }

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                width: '800px',
                margin: '20px auto',
            }}
        >
            <H1 style={{ margin: 0, flex: 1 }}>Connect project</H1>
            <Divider style={{ margin: '20px 0' }} />
            <CreateProjectConnection />
        </div>
    );
};

export default CreateProject;
