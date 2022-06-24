import { Colors, Icon } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import React, { FC, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
    ContentContainer,
    Header,
    Title,
    TitleWrapper,
} from '../../pages/ProjectSettings.styles';
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
            <ContentContainer>
                {showProjectAccessCreate ? (
                    <ProjectAccessCreation
                        onBackClick={() => {
                            setShowProjectAccessCreate(false);
                        }}
                    />
                ) : (
                    <>
                        <Header>
                            <TitleWrapper>
                                <Title>Project access</Title>
                                <a
                                    role="button"
                                    href="https://docs.lightdash.com/references/roles"
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ color: Colors.GRAY5 }}
                                >
                                    <Icon icon="info-sign" />
                                </a>
                            </TitleWrapper>
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
                        </Header>
                        <ProjectAccess />
                    </>
                )}
            </ContentContainer>
        </Content>
    );
};

export default ProjectUserAccess;
