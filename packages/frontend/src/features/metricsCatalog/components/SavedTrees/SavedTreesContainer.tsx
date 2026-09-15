import { Button, useMatches } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { ReactFlowProvider } from '@xyflow/react';
import { useEffect, type FC } from 'react';
import { useParams } from 'react-router';
import ResizableSplitter from '../../../../components/common/ResizableSplitter';
import { useUiStrings } from '../../../../ee/providers/Embed/useUiStrings';
import { useAppDispatch, useAppSelector } from '../../../sqlRunner/store/hooks';
import { useMetricsTreeDetails } from '../../hooks/useSavedMetricsTrees';
import { setActiveTreeUuid } from '../../store/metricsCatalogSlice';
import sidebarStyles from '../Canvas/CanvasSidebar.module.css';
import { CanvasViewport } from '../Canvas/CanvasViewport';
import SavedTreeCanvas from './SavedTreeCanvas';
import TreeListSidebar from './TreeListSidebar';

const SavedTreesContainer: FC = () => {
    const getUiString = useUiStrings();
    const compact = useMatches(
        { base: true, sm: false },
        { getInitialValueInEffect: false },
    );
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
                    hiddenFrom="sm"
                    variant="default"
                    h={44}
                    onClick={openTrees}
                >
                    {getUiString('metrics.savedTrees')}
                </Button>
            }
        >
            <ResizableSplitter
                orientation="horizontal"
                withHandle
                lineSize={compact ? 0 : 2}
                resizable={!compact}
                sizes={compact ? [0, 100] : undefined}
                classNames={{ handle: sidebarStyles.resizeHandle }}
                style={{ flex: 1, minHeight: 0 }}
            >
                <ResizableSplitter.Pane
                    id="tree-list-sidebar"
                    defaultSize={20}
                    min={compact ? 0 : 15}
                    max={40}
                >
                    <TreeListSidebar
                        opened={treesOpened}
                        onClose={closeTrees}
                    />
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
        </CanvasViewport>
    );
};

export default SavedTreesContainer;
