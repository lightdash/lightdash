import { subject } from '@casl/ability';
import { canMutateVerifiedContent, type SavedChart } from '@lightdash/common';
import { Button } from '@mantine/core';
import { IconChartBar, IconPencil } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Provider } from 'react-redux';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import Page from '../../../../../components/common/Page/Page';
import DashboardChartEditorModal from '../../../../../components/DashboardTiles/DashboardChartEditorModal';
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
    // Store initializes once; the parent key remounts it per chart version.
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

const noop = () => {};

// Keyed by chart uuid from the parent, so mode resets per chart.
const ThreadChartModalInner: FC<{ chart: SavedChart; onClose: () => void }> = ({
    chart,
    onClose,
}) => {
    const [mode, setMode] = useState<'view' | 'edit'>('view');
    const { user } = useApp();

    // Mirrors the saved-chart view page's gate for its "Edit chart" button.
    const userCanManageChart =
        !!user.data?.ability?.can(
            'manage',
            subject('SavedChart', { ...chart }),
        ) &&
        canMutateVerifiedContent(
            user.data.ability,
            {
                organizationUuid: chart.organizationUuid,
                projectUuid: chart.projectUuid,
            },
            chart.verification,
            user.data.userUuid,
        );

    if (mode === 'edit') {
        return (
            <DashboardChartEditorModal
                opened
                dashboard={null}
                editChart={chart}
                customMetricsEnabled={false}
                onBeforeOpenChartPage={noop}
                onChartSaved={() => setMode('view')}
                onRegistryMetricEdited={noop}
                onRegistryMetricDeleted={noop}
                onClose={() => setMode('view')}
            />
        );
    }

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={chart.name}
            icon={IconChartBar}
            fullScreen
            cancelLabel={false}
            modalBodyProps={{ px: 0, py: 0 }}
            headerActions={
                userCanManageChart ? (
                    <Button
                        variant="default"
                        size="xs"
                        leftSection={<MantineIcon icon={IconPencil} />}
                        onClick={() => setMode('edit')}
                    >
                        Edit chart
                    </Button>
                ) : undefined
            }
        >
            <ChartViewContent
                key={`${chart.uuid}-${chart.updatedAt}`}
                chart={chart}
            />
        </MantineModal>
    );
};

type Props = {
    chartUuid: string | null;
    projectUuid: string | undefined;
    onClose: () => void;
};

/**
 * Saved-chart view over the AI agent thread, so a chart the agent created or
 * edited can be inspected without leaving the conversation. Mirrors the
 * /saved/:uuid view page; "Edit chart" switches to the modal-hosted editor,
 * and saving or leaving the editor returns to the refreshed view.
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
        <ThreadChartModalInner
            key={chart.uuid}
            chart={chart}
            onClose={onClose}
        />
    );
};

export default AiThreadChartEditorModal;
