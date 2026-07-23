import { FeatureFlags } from '@lightdash/common';
import { Stack, Tabs } from '@mantine-8/core';
import { IconUser, IconUsersGroup } from '@tabler/icons-react';
import { type FC } from 'react';
import { ProjectGroupAccess } from '../../features/projectGroupAccess';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';
import ProjectAccess from './ProjectAccess';
import classes from './ProjectAccess.module.css';

interface ProjectUserAccessProps {
    projectUuid: string;
}

const ProjectUserAccess: FC<ProjectUserAccessProps> = ({ projectUuid }) => {
    const { user } = useApp();
    const userGroupsFeatureFlagQuery = useServerFeatureFlag(
        FeatureFlags.UserGroupsEnabled,
    );

    if (!user.data) return null;

    const isGroupManagementEnabled =
        userGroupsFeatureFlagQuery.data?.enabled ?? false;

    return (
        <Stack gap="md">
            <Tabs
                keepMounted={false}
                defaultValue="users"
                variant="pills"
                classNames={{
                    list: classes.tabsList,
                    tab: classes.tab,
                    panel: classes.panel,
                }}
            >
                {isGroupManagementEnabled && (
                    <Tabs.List>
                        <Tabs.Tab
                            value="users"
                            leftSection={
                                <MantineIcon icon={IconUser} size="sm" />
                            }
                        >
                            Users
                        </Tabs.Tab>
                        <Tabs.Tab
                            value="groups"
                            leftSection={
                                <MantineIcon icon={IconUsersGroup} size="sm" />
                            }
                        >
                            Groups
                        </Tabs.Tab>
                    </Tabs.List>
                )}

                <Tabs.Panel value="users">
                    <ProjectAccess projectUuid={projectUuid} />
                </Tabs.Panel>

                <Tabs.Panel value="groups">
                    <ProjectGroupAccess projectUuid={projectUuid} />
                </Tabs.Panel>
            </Tabs>
        </Stack>
    );
};

export default ProjectUserAccess;
