import { subject } from '@casl/ability';
import { FC, useState } from 'react';
import { Subtitle, SubtitleWrapper } from '../../pages/ProjectSettings.styles';
import { useApp } from '../../providers/AppProvider';
import { Can } from '../common/Authorization';
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
                    projectUuid={projectUuid}
                    onBackClick={() => {
                        setShowProjectAccessCreate(false);
                    }}
                />
            ) : (
                <>
                    <SubtitleWrapper>
                        <Subtitle>
                            Learn more about permissions in our{' '}
                            <a
                                role="button"
                                href="https://docs.lightdash.com/references/roles"
                                target="_blank"
                                rel="noreferrer"
                            >
                                docs
                            </a>
                        </Subtitle>
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
                    </SubtitleWrapper>

                    <ProjectAccess projectUuid={projectUuid} />
                </>
            )}
        </>
    );
};

export default ProjectUserAccess;
