import { subject } from '@casl/ability';
import { Anchor, Button, Group, Text } from '@mantine/core';
import { FC, useState } from 'react';
import { useApp } from '../../providers/AppProvider/useApp';
import { Can } from '../common/Authorization';
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
                <Can
                    I={'manage'}
                    this={subject('Project', {
                        organizationUuid: user.data?.organizationUuid,
                        projectUuid,
                    })}
                >
                    <Button
                        onClick={() => {
                            setShowProjectAccessCreate(true);
                        }}
                        size={'xs'}
                    >
                        Add user
                    </Button>
                </Can>
            </Group>

            <ProjectAccess projectUuid={projectUuid} />

            {showProjectAccessCreate && (
                <ProjectAccessCreation
                    opened={showProjectAccessCreate}
                    projectUuid={projectUuid}
                    onClose={() => {
                        setShowProjectAccessCreate(false);
                    }}
                />
            )}
        </>
    );
};

export default ProjectUserAccess;
