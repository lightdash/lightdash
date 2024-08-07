import { ActionIcon, Group, Paper, Stack, Tooltip } from '@mantine/core';
import { IconLayoutSidebarLeftExpand } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { useParams } from 'react-router-dom';
import { useUnmount } from 'react-use';
// import ErrorState from '../components/common/ErrorState';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';

import { Sidebar } from '../features/semanticViewer';
import { ContentPanel } from '../features/semanticViewer/components/ContentPanel';
import { store } from '../features/semanticViewer/store';
import {
    useAppDispatch,
    useAppSelector,
} from '../features/semanticViewer/store/hooks';
import {
    resetState,
    setProjectUuid,
} from '../features/semanticViewer/store/semanticViewerSlice';
// import { useProject } from '../hooks/useProject'; // FIXME: ???

const SemanticViewerPageWithStore = () => {
    const dispatch = useAppDispatch();
    const projectUuid = useAppSelector(
        (state) => state.semanticViewer.projectUuid,
    );

    const params = useParams<{ projectUuid: string; slug?: string }>();

    const [isLeftSidebarOpen, setLeftSidebarOpen] = useState(true);
    // const { data: project } = useProject(projectUuid);

    useUnmount(() => {
        dispatch(resetState());
    });

    useEffect(() => {
        if (!projectUuid && params.projectUuid) {
            dispatch(setProjectUuid(params.projectUuid));
        }
    }, [dispatch, params.projectUuid, projectUuid]);

    return (
        <Page
            title="SQL Runner"
            noContentPadding
            flexContent
            isSidebarOpen={isLeftSidebarOpen}
            sidebar={<Sidebar setSidebarOpen={setLeftSidebarOpen} />}
        >
            <Group
                align={'stretch'}
                grow
                spacing="none"
                p={0}
                style={{ flex: 1 }}
                w="100%"
            >
                {!isLeftSidebarOpen && (
                    <Paper
                        shadow="none"
                        radius={0}
                        px="sm"
                        py="lg"
                        style={{ flexGrow: 0 }}
                    >
                        <Stack spacing="xs">
                            <Tooltip
                                variant="xs"
                                label={'Open sidebar'}
                                position="right"
                            >
                                <ActionIcon size="sm">
                                    <MantineIcon
                                        icon={IconLayoutSidebarLeftExpand}
                                        onClick={() => setLeftSidebarOpen(true)}
                                    />
                                </ActionIcon>
                            </Tooltip>
                        </Stack>
                    </Paper>
                )}
                <ContentPanel />
            </Group>
        </Page>
    );
};

const SemanticViewerPage = () => {
    return (
        <Provider store={store}>
            <SemanticViewerPageWithStore />
        </Provider>
    );
};

export default SemanticViewerPage;
