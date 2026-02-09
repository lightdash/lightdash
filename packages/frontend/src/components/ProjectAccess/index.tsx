import { subject } from '@casl/ability';
import { FeatureFlags } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Stack,
    Tabs,
    Title,
    Tooltip,
} from '@mantine-8/core';
import {
    IconInfoCircle,
    IconPlus,
    IconUser,
    IconUsersGroup,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
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

    const [showProjectAccessAdd, setShowProjectAccessAdd] = useState(false);
    const [showProjectGroupAccessAdd, setShowProjectGroupAccessAdd] =
        useState(false);

    if (!user.data) return null;

    if (userGroupsFeatureFlagQuery.isError) {
        console.error(userGroupsFeatureFlagQuery.error);
        throw new Error('Error fetching user groups feature flag');
    }

    const isGroupManagementEnabled =
        userGroupsFeatureFlagQuery.isSuccess &&
        userGroupsFeatureFlagQuery.data.enabled;

    const canManageProjectAccess = user.data.ability.can(
        'manage',
        subject('Project', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    return (
        <Stack gap="sm">
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
                <Group gap="xs" align="center" className={classes.header}>
                    <Title order={5}>Project access</Title>
                    <Tooltip
                        label="Click here to learn more about permissions"
                        position="right"
                    >
                        <ActionIcon
                            component="a"
                            href="https://docs.lightdash.com/references/roles"
                            target="_blank"
                            rel="noreferrer"
                            variant="subtle"
                            size="xs"
                            color="ldGray.6"
                        >
                            <MantineIcon icon={IconInfoCircle} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
                {isGroupManagementEnabled && (
                    <Tabs.List>
                        <Tabs.Tab
                            value="users"
                            leftSection={<MantineIcon icon={IconUser} />}
                        >
                            Users
                        </Tabs.Tab>
                        <Tabs.Tab
                            value="groups"
                            leftSection={<MantineIcon icon={IconUsersGroup} />}
                        >
                            Groups
                        </Tabs.Tab>
                    </Tabs.List>
                )}
                <Tabs.Panel value="users">
                    <ProjectAccess
                        projectUuid={projectUuid}
                        isAddingProjectAccess={showProjectAccessAdd}
                        onAddProjectAccessOpen={() =>
                            setShowProjectAccessAdd(true)
                        }
                        onAddProjectAccessClose={() =>
                            setShowProjectAccessAdd(false)
                        }
                    />
                </Tabs.Panel>
                <Tabs.Panel value="groups">
                    <Stack gap="md">
                        {canManageProjectAccess && (
                            <Group justify="flex-end">
                                <Button
                                    size="xs"
                                    leftSection={<MantineIcon icon={IconPlus} />}
                                    onClick={() =>
                                        setShowProjectGroupAccessAdd(true)
                                    }
                                >
                                    Add group access
                                </Button>
                            </Group>
                        )}
                        <ProjectGroupAccess
                            projectUuid={projectUuid}
                            isAddingProjectGroupAccess={
                                showProjectGroupAccessAdd
                            }
                            onAddProjectGroupAccessClose={() =>
                                setShowProjectGroupAccessAdd(false)
                            }
                        />
                    </Stack>
                </Tabs.Panel>
            </Tabs>
        </Stack>
    );
};

export default ProjectUserAccess;
