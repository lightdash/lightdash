import { Center, Loader } from '@mantine/core';
import { useState, type FC } from 'react';
import { Provider } from 'react-redux';
import MantineModal from '../../../../../components/common/MantineModal';
import Page from '../../../../../components/common/Page/Page';
import Explorer from '../../../../../components/Explorer';
import ExploreSideBar from '../../../../../components/Explorer/ExploreSideBar';
import {
    buildInitialExplorerState,
    createExplorerStore,
} from '../../../../../features/explorer/store';
import { useTriedFields } from '../../../../../features/semanticStudio/useModelFieldChanges';
import { type TriedFields } from '../../../../../features/semanticStudio/useTryInExplore';
import { useExplorerQueryEffects } from '../../../../../hooks/useExplorerQueryEffects';
import { ExplorerSection } from '../../../../../providers/Explorer/types';
import { ModalHostedContext } from '../../../../../providers/Explorer/useIsModalHosted';

const buildState = (model: string, fields: TriedFields) => {
    const state = buildInitialExplorerState({ isEditMode: true });
    return buildInitialExplorerState({
        isEditMode: true,
        initialState: {
            queryExecution: { ...state.queryExecution, pendingFetch: true },
            expandedSections: [
                ExplorerSection.VISUALIZATION,
                ExplorerSection.RESULTS,
            ],
            unsavedChartVersion: {
                ...state.unsavedChartVersion,
                tableName: model,
                metricQuery: {
                    ...state.unsavedChartVersion.metricQuery,
                    exploreName: model,
                    dimensions: fields.dimensions,
                    metrics: fields.metrics,
                },
            },
        },
    });
};

const QueryEffects: FC = () => {
    useExplorerQueryEffects();
    return null;
};

const TriedExplore: FC<{
    model: string;
    fields: TriedFields;
    title: string;
    onClose: () => void;
}> = ({ model, fields, title, onClose }) => {
    const [store] = useState(() =>
        createExplorerStore({ explorer: buildState(model, fields) }),
    );
    return (
        <Provider store={store}>
            <QueryEffects />
            <MantineModal
                opened
                fullScreen
                title={title}
                subtitle="Only you see these changes until they are merged."
                onClose={onClose}
                cancelLabel={false}
                modalRootProps={{ yOffset: 56, xOffset: 40 }}
                modalBodyProps={{ px: 0, py: 0 }}
            >
                <ModalHostedContext.Provider value={{ isModalHosted: true }}>
                    {/* The modal says what is being tried, so the dock steps aside. */}
                    <span data-studio-try-it hidden />
                    <Page
                        withContainerHeight
                        withFullHeight
                        withPaddedContent
                        sidebar={<ExploreSideBar />}
                    >
                        <Explorer hideHeader />
                    </Page>
                </ModalHostedContext.Provider>
            </MantineModal>
        </Provider>
    );
};

/** A model's changes in Explore, over the page they were asked from; the app reads the changes only while it is open. */
export const TryItModal: FC<{
    projectUuid: string;
    model: string;
    previewProjectUuid: string | null;
    title: string;
    onClose: () => void;
}> = ({ projectUuid, model, previewProjectUuid, title, onClose }) => {
    const fields = useTriedFields(projectUuid, model, previewProjectUuid);
    if (!fields) {
        return (
            <MantineModal
                opened
                title={title}
                onClose={onClose}
                cancelLabel={false}
            >
                <Center p="xl">
                    <Loader size="sm" />
                </Center>
            </MantineModal>
        );
    }
    return (
        <TriedExplore
            model={model}
            fields={fields}
            title={title}
            onClose={onClose}
        />
    );
};
