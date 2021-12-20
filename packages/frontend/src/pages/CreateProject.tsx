import { Divider, H1 } from '@blueprintjs/core';
import React, { FC } from 'react';
import { Redirect } from 'react-router-dom';
import { OpenChatButton } from '../components/common/ChatBubble/OpenChatButton';
import Page from '../components/common/Page/Page';
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

    return (
        <Page isFullHeight>
            <div
                style={{
                    display: 'flex',
                    width: '800px',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    flex: 1,
                }}
            >
                <H1 style={{ margin: 0, flex: 1 }}>Connect project</H1>
                <Divider style={{ margin: '20px 0' }} />
                <CreateProjectConnection />
            </div>
            <OpenChatButton />
        </Page>
    );
};

export default CreateProject;
