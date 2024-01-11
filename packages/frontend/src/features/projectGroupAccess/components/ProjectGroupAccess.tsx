import { Box, Paper, Table } from '@mantine/core';
import { IconUsersGroup } from '@tabler/icons-react';
import { FC } from 'react';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import { useOrganizationGroups } from '../../../hooks/useOrganizationGroups';
import { TrackPage } from '../../../providers/TrackingProvider';
import { CategoryName, PageName, PageType } from '../../../types/Events';
import { useProjectGroupAccessList } from '../hooks/useProjectGroupAccess';
import AddProjectGroupAccessModal from './AddProjectGroupAccessModal';
import ProjectGroupAccessItem from './ProjectGroupAccessItem';

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

    const { data: groups, isLoading: isLoadingGroups } =
        useOrganizationGroups(5);

    const {
        data: projectGroupAccessList,
        isLoading: isLoadingProjectGroupAccessList,
    } = useProjectGroupAccessList(projectUuid);

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
                                        group && (
                                            <ProjectGroupAccessItem
                                                key={
                                                    projectGroupAccess.groupUuid
                                                }
                                                access={projectGroupAccess}
                                                group={group}
                                                projectUuid={projectUuid}
                                            />
                                        )
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
