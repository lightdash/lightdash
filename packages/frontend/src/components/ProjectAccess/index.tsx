import { subject } from '@casl/ability';
import { Anchor, Button, Divider, Group, Text } from '@mantine/core';
import { IconUserPlus, IconUsersGroup } from '@tabler/icons-react';
import { FC, useState } from 'react';
import { ProjectGroupAccessModal } from '../../features/projectGroupAccess';
import { useApp } from '../../providers/AppProvider';
import { Can } from '../common/Authorization';
import MantineIcon from '../common/MantineIcon';
import ProjectAccess from './ProjectAccess';
import ProjectAccessCreation from './ProjectAccessCreation';

interface ProjectUserAccessProps {
    projectUuid: string;
}

const ProjectUserAccess: FC<ProjectUserAccessProps> = ({ projectUuid }) => {
    const { user } = useApp();
    const [showProjectAccessCreate, setShowProjectAccessCreate] =
        useState(false);
    const [showGroupAccessModal, setShowGroupAccessModal] = useState(false);

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

                <div>
                    <Can
                        I="manage"
                        this={subject('Project', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid,
                        })}
                    >
                        <Button.Group>
                            <Button
                                leftIcon={<MantineIcon icon={IconUserPlus} />}
                                onClick={() => setShowProjectAccessCreate(true)}
                                size="xs"
                            >
                                Add user access
                            </Button>

                            <Divider orientation="vertical" color="blue.7" />

                            <Button
                                leftIcon={<MantineIcon icon={IconUsersGroup} />}
                                onClick={() => setShowGroupAccessModal(true)}
                                size="xs"
                            >
                                Manage group access
                            </Button>
                        </Button.Group>
                    </Can>
                </div>
            </Group>

            <ProjectAccess projectUuid={projectUuid} />

            {showProjectAccessCreate && (
                <ProjectAccessCreation
                    opened
                    projectUuid={projectUuid}
                    onClose={() => setShowProjectAccessCreate(false)}
                />
            )}

            {showGroupAccessModal && (
                <ProjectGroupAccessModal
                    opened
                    projectUuid={projectUuid}
                    onClose={() => setShowGroupAccessModal(false)}
                />
            )}
        </>
    );
};

export default ProjectUserAccess;
