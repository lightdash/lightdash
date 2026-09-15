import { Button } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { ReactFlowProvider } from '@xyflow/react';
import { useEffect, type FC } from 'react';
import { Panel, PanelGroup } from 'react-resizable-panels';
import { useParams } from 'react-router';
import { useUiStrings } from '../../../../ee/providers/Embed/useUiStrings';
import { useAppDispatch, useAppSelector } from '../../../sqlRunner/store/hooks';
import { useMetricsTreeDetails } from '../../hooks/useSavedMetricsTrees';
import { setActiveTreeUuid } from '../../store/metricsCatalogSlice';
import { CanvasViewport } from '../Canvas/CanvasViewport';
import SavedTreeCanvas from './SavedTreeCanvas';
import TreeListSidebar from './TreeListSidebar';

const SavedTreesContainer: FC = () => {
    const getUiString = useUiStrings();
    const [treesOpened, { open: openTrees, close: closeTrees }] =
        useDisclosure(false);
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
        <CanvasViewport
            navigation={
                <Button
                    hiddenFrom="md"
                    variant="default"
                    h={44}
                    onClick={openTrees}
                >
                    {getUiString('metrics.savedTrees')}
                </Button>
            }
        >
            <PanelGroup
                direction="horizontal"
                style={{ flex: 1, minHeight: 0 }}
            >
                <TreeListSidebar opened={treesOpened} onClose={closeTrees} />
                <Panel id="saved-tree-canvas" order={2}>
                    <ReactFlowProvider key={`${editMode}-${activeTreeUuid}`}>
                        <SavedTreeCanvas
                            mode={editMode}
                            treeUuid={activeTreeUuid}
                        />
                    </ReactFlowProvider>
                </Panel>
            </PanelGroup>
        </CanvasViewport>
    );
};

export default SavedTreesContainer;
