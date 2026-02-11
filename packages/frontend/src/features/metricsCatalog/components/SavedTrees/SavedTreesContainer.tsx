import { Box } from '@mantine-8/core';
import { ReactFlowProvider } from '@xyflow/react';
import { type FC } from 'react';
import { Panel, PanelGroup } from 'react-resizable-panels';
import { useAppSelector } from '../../../sqlRunner/store/hooks';
import SavedTreeCanvas from './SavedTreeCanvas';
import TreeListSidebar from './TreeListSidebar';

const SavedTreesContainer: FC = () => {
    const activeTreeUuid = useAppSelector(
        (state) => state.metricsCatalog.activeTreeUuid,
    );
    const editMode = useAppSelector(
        (state) => state.metricsCatalog.savedTreeEditMode,
    );

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
