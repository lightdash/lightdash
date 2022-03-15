import { Colors, H1 } from '@blueprintjs/core';
import React, { FC } from 'react';
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

    // if (health.status === 'success' && !health.data?.needsProject) {
    //     return (
    //         <Redirect
    //             to={{
    //                 pathname: '/',
    //             }}
    //         />
    //     );
    // }

    return (
        <Page>
            <div
                style={{
                    display: 'flex',
                    width: '800px',
                    flexDirection: 'column',
                    flex: 1,
                    paddingTop: 60,
                }}
            >
                <H1 style={{ marginBottom: 30 }}>Connect your project ⚡</H1>
                <p style={{ color: Colors.GRAY1, marginBottom: 30 }}>
                    The following steps are best carried out by your
                    organization&apos;s data/analytics engineering experts. Once
                    you set up your dbt and warehouse connection, you will be
                    ready to start exploring your data in Lightdash! If you are
                    just itching to get start,{' '}
                    <a
                        target="_blank"
                        rel="noreferrer"
                        href="https://demo.lightdash.com"
                    >
                        check out our demo project!
                    </a>
                </p>
                <CreateProjectConnection />
            </div>
            <OpenChatButton />
        </Page>
    );
};

export default CreateProject;
