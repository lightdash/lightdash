import { ActionIcon, Group, Paper, Stack, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconLayoutSidebarLeftExpand } from '@tabler/icons-react';
import { Provider } from 'react-redux';
import { useParams } from 'react-router-dom';
import { useMount, useUnmount } from 'react-use';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import * as SemanticViewer from '../features/semanticViewer';
import { store } from '../features/semanticViewer/store';
import { useAppDispatch } from '../features/semanticViewer/store/hooks';
import {
    resetState,
    setProjectUuid,
} from '../features/semanticViewer/store/semanticViewerSlice';

const SemanticViewerPageWithStore = () => {
    const [isLeftSidebarOpen, { close: sidebarClose, open: sidebarOpen }] =
        useDisclosure(true);

    const params = useParams<{ projectUuid: string; slug?: string }>();

    const dispatch = useAppDispatch();

    useMount(() => {
        dispatch(setProjectUuid(params.projectUuid));
    });

    useUnmount(() => {
        dispatch(resetState());
    });

    return (
        <Page
            title="Semantic Viewer"
            withFullHeight
            noContentPadding
            isSidebarOpen={isLeftSidebarOpen}
            sidebar={<SemanticViewer.Sidebar onSidebarClose={sidebarClose} />}
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
                                        onClick={sidebarOpen}
                                    />
                                </ActionIcon>
                            </Tooltip>
                        </Stack>
                    </Paper>
                )}

                <SemanticViewer.Content />
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
