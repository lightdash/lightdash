import { subject } from '@casl/ability';
import { Anchor, Button, Group, Stack, Tabs, Text } from '@mantine/core';
import { IconPlus, IconUser, IconUsersGroup } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { ProjectGroupAccess } from '../../features/projectGroupAccess';
import { useApp } from '../../providers/AppProvider';
import { Can } from '../common/Authorization';
import MantineIcon from '../common/MantineIcon';
import ProjectAccess from './ProjectAccess';

interface ProjectUserAccessProps {
    projectUuid: string;
}

const ProjectUserAccess: FC<ProjectUserAccessProps> = ({ projectUuid }) => {
    const { user, health } = useApp();

    const [showProjectAccessAdd, setShowProjectAccessAdd] = useState(false);
    const [showProjectGroupAccessAdd, setShowProjectGroupAccessAdd] =
        useState(false);

    if (!user.data || !health.data) return null;

    const isGroupManagementEnabled = health.data.hasGroups;

    return (
        <Stack>
            <Group position="apart">
                <Text color="dimmed">
                    Learn more about permissions in our{' '}
                    <Anchor
                        role="button"
                        href={`${health.data?.siteHelpdeskUrl}/references/roles`}
                        target="_blank"
                        rel="noreferrer"
                    >
                        docs
                    </Anchor>
                </Text>
            </Group>

            <Tabs defaultValue="users">
                <Stack>
                    {isGroupManagementEnabled && (
                        <Tabs.List>
                            <Tabs.Tab
                                icon={<MantineIcon icon={IconUser} size="sm" />}
                                value="users"
                            >
                                Users
                            </Tabs.Tab>
                            <Tabs.Tab
                                icon={
                                    <MantineIcon
                                        icon={IconUsersGroup}
                                        size="sm"
                                    />
                                }
                                value="groups"
                            >
                                Groups
                            </Tabs.Tab>
                        </Tabs.List>
                    )}

                    <Tabs.Panel value="users">
                        <Stack>
                            <Can
                                I="manage"
                                this={subject('Project', {
                                    organizationUuid:
                                        user.data?.organizationUuid,
                                    projectUuid,
                                })}
                            >
                                <Button
                                    style={{ alignSelf: 'flex-end' }}
                                    leftIcon={<MantineIcon icon={IconPlus} />}
                                    onClick={() =>
                                        setShowProjectAccessAdd(true)
                                    }
                                    size="xs"
                                >
                                    Add user access
                                </Button>
                            </Can>

                            <ProjectAccess
                                projectUuid={projectUuid}
                                isAddingProjectAccess={showProjectAccessAdd}
                                onAddProjectAccessClose={() =>
                                    setShowProjectAccessAdd(false)
                                }
                            />
                        </Stack>
                    </Tabs.Panel>

                    <Tabs.Panel value="groups">
                        <Stack>
                            <Can
                                I="manage"
                                this={subject('Project', {
                                    organizationUuid:
                                        user.data?.organizationUuid,
                                    projectUuid,
                                })}
                            >
                                <Button
                                    style={{ alignSelf: 'flex-end' }}
                                    leftIcon={<MantineIcon icon={IconPlus} />}
                                    onClick={() =>
                                        setShowProjectGroupAccessAdd(true)
                                    }
                                    size="xs"
                                >
                                    Add group access
                                </Button>
                            </Can>

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
                </Stack>
            </Tabs>
        </Stack>
    );
};

export default ProjectUserAccess;
