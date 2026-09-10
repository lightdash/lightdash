import { type SavedChart } from '@lightdash/common';
import { IconChartBar } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Provider } from 'react-redux';
import MantineModal from '../../../../../components/common/MantineModal';
import Page from '../../../../../components/common/Page/Page';
import Explorer from '../../../../../components/Explorer';
import {
    buildInitialExplorerState,
    createExplorerStore,
} from '../../../../../features/explorer/store';
import { MergeProvider } from '../../../../../features/mergeQuery/context/MergeContext';
import { useExplorerQueryEffects } from '../../../../../hooks/useExplorerQueryEffects';
import { useSavedQuery } from '../../../../../hooks/useSavedQuery';
import useApp from '../../../../../providers/App/useApp';
import { ExplorerSection } from '../../../../../providers/Explorer/types';

// Query effects must run inside the store Provider.
const ExplorerEffects: FC = () => {
    useExplorerQueryEffects();
    return null;
};

const ChartViewContent: FC<{ chart: SavedChart }> = ({ chart }) => {
    const { health } = useApp();
    // Store initializes once; the parent key remounts it per chart.
    const [store] = useState(() =>
        createExplorerStore({
            explorer: buildInitialExplorerState({
                savedChart: chart,
                isEditMode: false,
                expandedSections: [ExplorerSection.VISUALIZATION],
                defaultLimit: health.data?.query.defaultLimit,
            }),
        }),
    );

    return (
        <Provider store={store}>
            <ExplorerEffects />
            <Page withContainerHeight withFullHeight withPaddedContent>
                <MergeProvider savedMerge={chart.merge ?? null}>
                    <Explorer />
                </MergeProvider>
            </Page>
        </Provider>
    );
};

type Props = {
    chartUuid: string | null;
    projectUuid: string | undefined;
    onClose: () => void;
};

/**
 * Read-only saved-chart view over the AI agent thread, so a chart the agent
 * created or edited can be inspected without leaving the conversation.
 * Mirrors the /saved/:uuid view page: same Explorer in view mode.
 */
const AiThreadChartEditorModal: FC<Props> = ({
    chartUuid,
    projectUuid,
    onClose,
}) => {
    const { data: chart } = useSavedQuery({
        uuidOrSlug: chartUuid ?? undefined,
        projectUuid,
        useQueryOptions: { enabled: !!chartUuid && !!projectUuid },
    });

    if (!chartUuid || !chart || chart.uuid !== chartUuid) return null;

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={chart.name}
            icon={IconChartBar}
            fullScreen
            cancelLabel={false}
            modalBodyProps={{ px: 0, py: 0 }}
        >
            <ChartViewContent key={chart.uuid} chart={chart} />
        </MantineModal>
    );
};

export default AiThreadChartEditorModal;
