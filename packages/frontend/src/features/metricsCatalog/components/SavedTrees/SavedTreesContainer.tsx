import { Box } from '@mantine-8/core';
import { ReactFlowProvider } from '@xyflow/react';
import { useEffect, type FC } from 'react';
import { Panel, PanelGroup } from 'react-resizable-panels';
import { useParams } from 'react-router';
import { useAppDispatch, useAppSelector } from '../../../sqlRunner/store/hooks';
import { useMetricsTreeDetails } from '../../hooks/useSavedMetricsTrees';
import { setActiveTreeUuid } from '../../store/metricsCatalogSlice';
import SavedTreeCanvas from './SavedTreeCanvas';
import TreeListSidebar from './TreeListSidebar';

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
            <PanelGroup direction="horizontal" style={{ height: '100%' }}>
                <TreeListSidebar />
                <Panel id="saved-tree-canvas" order={2}>
                    <ReactFlowProvider key={`${editMode}-${activeTreeUuid}`}>
                        <SavedTreeCanvas
                            mode={editMode}
                            treeUuid={activeTreeUuid}
                        />
                    </ReactFlowProvider>
                </Panel>
            </PanelGroup>
        </Box>
    );
};

export default SavedTreesContainer;
