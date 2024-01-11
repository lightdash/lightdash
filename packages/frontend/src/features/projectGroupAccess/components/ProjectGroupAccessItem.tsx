import { GroupWithMembers, ProjectGroupAccess } from '@lightdash/common';
import { ActionIcon, Group } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { FC, useState } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import useToaster from '../../../hooks/toaster/useToaster';
import { useRemoveProjectGroupAccessMutation } from '../hooks/useProjectGroupAccess';
import RevokeProjectGroupAccessModal from './RevokeProjectGroupAccessModal';

type ProjectGroupAccessItemProps = {
    projectUuid: string;
    group: GroupWithMembers;
    access: ProjectGroupAccess;
};

const ProjectGroupAccessItem: FC<ProjectGroupAccessItemProps> = ({
    projectUuid,
    group,
    access,
}) => {
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

    const { showToastSuccess } = useToaster();

    const { mutateAsync: removeProjectGroupAccess } =
        useRemoveProjectGroupAccessMutation();

    const handleRemoveProjectGroupAccess = async (groupUuid: string) => {
        await removeProjectGroupAccess({ projectUuid, groupUuid });
        showToastSuccess({ title: 'Group access removed' });
    };

    return (
        <>
            <tr key={access.groupUuid}>
                <td>{group.name}</td>
                <td>{access.role}</td>
                <td>
                    <Group position="right">
                        <ActionIcon
                            variant="outline"
                            color="red"
                            onClick={() =>
                                setIsDeleteDialogOpen(!isDeleteDialogOpen)
                            }
                        >
                            <MantineIcon icon={IconTrash} />
                        </ActionIcon>
                    </Group>
                </td>
            </tr>

            {isDeleteDialogOpen && (
                <RevokeProjectGroupAccessModal
                    group={group}
                    onDelete={() =>
                        handleRemoveProjectGroupAccess(access.groupUuid)
                    }
                    onClose={() => setIsDeleteDialogOpen(false)}
                />
            )}
        </>
    );
};

export default ProjectGroupAccessItem;
