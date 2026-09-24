import { Center, Loader, Text } from '@mantine/core';
import { useContext, type FC } from 'react';
import { useProject } from '../../../../hooks/useProject';
import { Sidebar } from '../../components/Sidebar';
import { useAppSelector } from '../../store/hooks';
import { ActiveConnectionContext } from '../hooks/activeConnectionContext';
import { useSqlRunnerConnections } from '../hooks/useConnectionCatalog';
import { MultiConnectionSidebar } from './MultiConnectionSidebar';

const MultiConnectionSidebarContainer: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const activeConnection = useContext(ActiveConnectionContext);
    const { error } = useSqlRunnerConnections(projectUuid, true);
    if (error?.error.name === 'SingleConnectionProjectError') {
        return <Sidebar />;
    }
    if (error) {
        return (
            <Center p="sm">
                <Text c="red" fz="sm" ta="center">
                    {error.error.message}
                </Text>
            </Center>
        );
    }
    if (!activeConnection) {
        return (
            <Center p="sm">
                <Loader size="sm" />
            </Center>
        );
    }
    return <MultiConnectionSidebar />;
};

export const SqlRunnerSidebar: FC = () => {
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const { data: project } = useProject(projectUuid);
    if (!project) return null;
    if (project.connectionRoute === 'multi') {
        return <MultiConnectionSidebarContainer projectUuid={projectUuid} />;
    }
    return <Sidebar />;
};
