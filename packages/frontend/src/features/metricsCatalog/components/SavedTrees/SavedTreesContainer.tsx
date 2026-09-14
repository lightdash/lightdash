import { Box } from '@mantine/core';
import { ReactFlowProvider } from '@xyflow/react';
import { useEffect, type FC } from 'react';
import { useParams } from 'react-router';
import ResizableSplitter from '../../../../components/common/ResizableSplitter';
import { useAppDispatch, useAppSelector } from '../../../sqlRunner/store/hooks';
import { useMetricsTreeDetails } from '../../hooks/useSavedMetricsTrees';
import { setActiveTreeUuid } from '../../store/metricsCatalogSlice';
import SavedTreeCanvas from './SavedTreeCanvas';
import TreeListSidebar from './TreeListSidebar';
import sidebarStyles from './TreeListSidebar.module.css';

const SavedTreesContainer: FC = () => {
    const dispatch = useAppDispatch();
    const { treeSlug } = useParams<{ treeSlug?: string }>();
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const activeTreeUuid = useAppSelector(
        (state) => state.metricsCatalog.activeTreeUuid,
    );
    const editMode = useAppSelector(
        (state) => state.metricsCatalog.savedTreeEditMode,
    );

    const { data: resolvedTree } = useMetricsTreeDetails(
        projectUuid,
        treeSlug ?? null,
    );

    useEffect(() => {
        if (treeSlug && resolvedTree) {
            dispatch(setActiveTreeUuid(resolvedTree.metricsTreeUuid));
        } else if (!treeSlug) {
            dispatch(setActiveTreeUuid(null));
        }
    }, [treeSlug, resolvedTree, dispatch]);

    return (
        <Box w="100%" h="100%">
            <ResizableSplitter
                withHandle
                lineSize={2}
                classNames={{ handle: sidebarStyles.resizeHandle }}
                orientation="horizontal"
                style={{ height: '100%' }}
            >
                <ResizableSplitter.Pane
                    id="tree-list-sidebar"
                    defaultSize={20}
                    min={15}
                    max={40}
                >
                    <TreeListSidebar />
                </ResizableSplitter.Pane>
                <ResizableSplitter.Pane id="saved-tree-canvas" defaultSize={80}>
                    <ReactFlowProvider key={`${editMode}-${activeTreeUuid}`}>
                        <SavedTreeCanvas
                            mode={editMode}
                            treeUuid={activeTreeUuid}
                        />
                    </ReactFlowProvider>
                </ResizableSplitter.Pane>
            </ResizableSplitter>
        </Box>
    );
};

export default SavedTreesContainer;
