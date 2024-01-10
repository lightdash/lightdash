import { Box, Button, Paper, Table } from '@mantine/core';
import { IconUsersGroup } from '@tabler/icons-react';
import { FC } from 'react';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import useToaster from '../../../hooks/toaster/useToaster';
import { useOrganizationGroups } from '../../../hooks/useOrganizationGroups';
import { TrackPage } from '../../../providers/TrackingProvider';
import { CategoryName, PageName, PageType } from '../../../types/Events';
import {
    useProjectGroupAccessList,
    useRemoveProjectGroupAccessMutation,
} from '../hooks/useProjectGroupAccess';
import AddProjectGroupAccessModal from './AddProjectGroupAccessModal';

interface ProjectGroupAccessProps {
    projectUuid: string;
    isAddingProjectGroupAccess: boolean;
    onAddProjectGroupAccessClose: () => void;
}

const ProjectGroupAccess: FC<ProjectGroupAccessProps> = ({
    projectUuid,
    isAddingProjectGroupAccess,
    onAddProjectGroupAccessClose,
}) => {
    const { cx, classes } = useTableStyles();

    const { showToastSuccess } = useToaster();

    const { data: groups, isLoading: isLoadingGroups } =
        useOrganizationGroups(5);

    const {
        data: projectGroupAccessList,
        isLoading: isLoadingProjectGroupAccessList,
    } = useProjectGroupAccessList(projectUuid);

    const { mutateAsync: removeProjectGroupAccess } =
        useRemoveProjectGroupAccessMutation();

    const handleRemoveProjectGroupAccess = async (groupUuid: string) => {
        await removeProjectGroupAccess({ projectUuid, groupUuid });
        showToastSuccess({ title: 'Group access removed' });
    };

    return (
        <TrackPage
            name={PageName.PROJECT_MANAGE_GROUP_ACCESS}
            type={PageType.PAGE}
            category={CategoryName.SETTINGS}
        >
            {isLoadingGroups || isLoadingProjectGroupAccessList ? (
                <Box mt="4xl">
                    <SuboptimalState loading />
                </Box>
            ) : projectGroupAccessList?.length === 0 ? (
                <Box mt="4xl">
                    <SuboptimalState
                        icon={IconUsersGroup}
                        title="No group found with access to this project"
                        description={
                            'Click "Add group access" to add a group to this project'
                        }
                    />
                </Box>
            ) : (
                <Paper withBorder style={{ overflow: 'hidden' }}>
                    <Table
                        className={cx(classes.root, classes.alignLastTdRight)}
                    >
                        <thead>
                            <tr>
                                <th>Group Name</th>
                                <th>Group Role</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {projectGroupAccessList?.map(
                                (projectGroupAccess) => {
                                    const group = groups?.find(
                                        (g) =>
                                            g.uuid ===
                                            projectGroupAccess.groupUuid,
                                    );

                                    return (
                                        <tr key={projectGroupAccess.groupUuid}>
                                            <td>{group?.name}</td>
                                            <td>{projectGroupAccess.role}</td>
                                            <td>
                                                <Button
                                                    size="xs"
                                                    variant="outline"
                                                    color="red"
                                                    onClick={() =>
                                                        handleRemoveProjectGroupAccess(
                                                            projectGroupAccess.groupUuid,
                                                        )
                                                    }
                                                >
                                                    Remove access
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                },
                            )}
                        </tbody>
                    </Table>
                </Paper>
            )}

            {isAddingProjectGroupAccess && (
                <AddProjectGroupAccessModal
                    projectUuid={projectUuid}
                    opened
                    onClose={() => onAddProjectGroupAccessClose()}
                />
            )}
        </TrackPage>
    );
};

export default ProjectGroupAccess;
