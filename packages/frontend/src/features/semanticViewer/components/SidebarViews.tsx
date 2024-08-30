import { Center, Loader, NavLink, Stack, Text } from '@mantine/core';
import { IconTable } from '@tabler/icons-react';
import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { useSemanticLayerViews } from '../api/hooks';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectSemanticLayerInfo } from '../store/selectors';
import { enterView } from '../store/semanticViewerSlice';

const SidebarViews = () => {
    const dispatch = useAppDispatch();
    const { projectUuid, features } = useAppSelector(selectSemanticLayerInfo);

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

    // if semantic layer does not support views, enter the default view.
    if (!features.views) {
        dispatch(enterView(views.data[0].name));
        return null;
    }

    return views.data.length === 0 ? (
        <SuboptimalState
            title="No views available"
            description="No views have been created in this project yet."
        />
    ) : (
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
