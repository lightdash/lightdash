import { Anchor, Button, Group, Text } from '@mantine/core';
import { FC, useState } from 'react';
import { useApp } from '../../providers/AppProvider';
import ProjectAccess from './ProjectAccess';
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

                {user.data?.ability?.can('manage', 'Project') && (
                    <>
                        <Button
                            onClick={() => setShowProjectAccessCreate(true)}
                        >
                            Add user
                        </Button>
                        <ProjectAccessCreation
                            projectUuid={projectUuid}
                            onClose={() => {
                                setShowProjectAccessCreate(false);
                            }}
                            opened={showProjectAccessCreate}
                        />
                    </>
                )}
            </Group>

            <ProjectAccess projectUuid={projectUuid} />
        </>
    );
};

export default ProjectUserAccess;
