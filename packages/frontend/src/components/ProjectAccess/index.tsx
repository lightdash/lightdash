import { Colors, Icon } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import { FC, useState } from 'react';
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

interface ProjectUserAccessProps {
    projectUuid: string;
}

const ProjectUserAccess: FC<ProjectUserAccessProps> = ({ projectUuid }) => {
    const { user } = useApp();
    const [showProjectAccessCreate, setShowProjectAccessCreate] =
        useState<boolean>(false);

    return (
        <>
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
                    <ProjectAccess projectUuid={projectUuid} />
                </>
            )}
        </>
    );
};

export default ProjectUserAccess;
