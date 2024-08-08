import { Center, Loader, NavLink, Stack, Text } from '@mantine/core';
import { IconTable } from '@tabler/icons-react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useSemanticLayerViews } from '../api/hooks';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { enterView } from '../store/semanticViewerSlice';

const SidebarViews = () => {
    const dispatch = useAppDispatch();
    const { projectUuid } = useAppSelector((state) => state.semanticViewer);

    const views = useSemanticLayerViews({ projectUuid });

    const handleViewClick = (view: string) => {
        dispatch(enterView(view));
    };

    if (views.isError) {
        throw views.error;
    }

    if (views.isLoading) {
        return (
            <Center sx={{ flexGrow: 1 }}>
                <Loader color="gray" size="sm" />
            </Center>
        );
    }

    return (
        <Stack spacing="one">
            {views.data.map((view) => (
                <NavLink
                    key={view.name}
                    h="xxl"
                    label={<Text truncate>{view.label}</Text>}
                    disabled={!view.visible}
                    icon={<MantineIcon icon={IconTable} />}
                    onClick={() => handleViewClick(view.name)}
                />
            ))}
        </Stack>
    );
};

export default SidebarViews;
