import { Button, Group } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { FC, useState } from 'react';
import { useProject } from '../../../hooks/useProject';
import MantineIcon from '../../common/MantineIcon';
import { ProjectDeleteModal } from './DeleteProjectModal';

type ProjectProperties = {
    projectUuid: string;
};

export const DeleteProjectPanel: FC<ProjectProperties> = ({ projectUuid }) => {
    const { isLoading: isLoading, data: project } = useProject(projectUuid);

    const [showDeleteProjectModal, setShowDeleteProjectModal] = useState(false);

    if (isLoading || project === undefined) return null;

    return (
        <Group position="right">
            <Button
                variant="outline"
                color="red"
                leftIcon={<MantineIcon icon={IconTrash} />}
                onClick={() => setShowDeleteProjectModal(true)}
            >
                Delete '{project.name}'
            </Button>

            <ProjectDeleteModal
                opened={showDeleteProjectModal}
                onClose={() => setShowDeleteProjectModal(false)}
                projectUuid={projectUuid}
            />
        </Group>
    );
};
