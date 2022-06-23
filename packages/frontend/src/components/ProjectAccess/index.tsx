import { subject } from '@casl/ability';
import React, { FC, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Title } from '../../pages/ProjectSettings.styles';
import { useApp } from '../../providers/AppProvider';
import { Can } from '../common/Authorization';
import Content from '../common/Page/Content';
import ProjectAccess from './ProjectAccess';
import { AddUserButton } from './ProjectAccess.styles';
import ProjectAccessCreation from './ProjectAccessCreation';

const ProjectUserAccess: FC = () => {
    const { user } = useApp();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [showProjectAccessCreate, setShowProjectAccessCreate] =
        useState<boolean>(false);
    return (
        <Content>
            {showProjectAccessCreate ? (
                <ProjectAccessCreation
                    onBackClick={() => {
                        setShowProjectAccessCreate(false);
                    }}
                />
            ) : (
                <>
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                        }}
                    >
                        <Title>Project access</Title>
                        {!showProjectAccessCreate && (
                            <Can
                                I={'manage'}
                                this={subject('Project', {
                                    organizationUuid:
                                        user.data?.organizationUuid,
                                    projectUuid,
                                })}
                            >
                                <AddUserButton
                                    intent="primary"
                                    onClick={() => {
                                        setShowProjectAccessCreate(true);
                                    }}
                                    text="Add user"
                                />
                            </Can>
                        )}
                    </div>
                    <ProjectAccess
                        onAddUser={() => {
                            setShowProjectAccessCreate(true);
                        }}
                    />
                </>
            )}
        </Content>
    );
};

export default ProjectUserAccess;
