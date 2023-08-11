import { subject } from '@casl/ability';
import { Anchor, Group, Text } from '@mantine/core';
import { FC, useState } from 'react';
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
                    <Group position="apart">
                        <Text color="dimmed">
                            Learn more about permissions in our{' '}
                            <Anchor
                                role="button"
                                href="https://docs.lightdash.com/references/roles"
                                target="_blank"
                                rel="noreferrer"
                            >
                                docs
                            </Anchor>
                        </Text>

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
                    </Group>

                    <ProjectAccess projectUuid={projectUuid} />
                </>
            )}
        </>
    );
};

export default ProjectUserAccess;
