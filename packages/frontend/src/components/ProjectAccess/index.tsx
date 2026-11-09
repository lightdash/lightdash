import { Stack, Tabs } from '@mantine/core';
import { IconUser, IconUsersGroup } from '@tabler/icons-react';
import { type FC } from 'react';
import { ProjectGroupAccess } from '../../features/projectGroupAccess';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';
import ProjectAccess from './ProjectAccess';

interface ProjectUserAccessProps {
    projectUuid: string;
}

const ProjectUserAccess: FC<ProjectUserAccessProps> = ({ projectUuid }) => {
    const { user } = useApp();

    if (!user.data) return null;

    return (
        <Stack gap="md">
            <Tabs keepMounted={false} defaultValue="users" variant="pills">
                <Tabs.List>
                    <Tabs.Tab
                        value="users"
                        leftSection={<MantineIcon icon={IconUser} size="sm" />}
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
