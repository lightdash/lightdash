import { deepEqual, type SemanticChartAsCode } from '@lightdash/common';
import { Button, Group, Stack, TextInput } from '@mantine/core';
import { useForm, type UseFormReturnType } from '@mantine/form';
import { useState } from 'react';
import { Provider } from 'react-redux';
import { useBeforeUnload } from 'react-router';
import MantineModal from '../../components/common/MantineModal';
import { useMantineModalClose } from '../../components/common/MantineModal/useMantineModalClose';
import Page from '../../components/common/Page/Page';
import Explorer from '../../components/Explorer';
import { useChartGalleryRightSidebar } from '../../components/Explorer/ChartGallery/useChartGalleryRightSidebar';
import ExploreSideBar from '../../components/Explorer/ExploreSideBar';
import { RefreshButton } from '../../components/RefreshButton';
import { useExplorerQueryEffects } from '../../hooks/useExplorerQueryEffects';
import { ModalHostedContext } from '../../providers/Explorer/useIsModalHosted';
import {
    createExplorerStore,
    selectIsValidQuery,
    selectUnsavedChartVersionForSave,
    useExplorerSelector,
} from '../explorer/store';
import {
    buildDocumentChartEditorState,
    getDocumentChartFromVersion,
    getQuerySignature,
} from './documentChartEditor';

type Props = {
    /** The chart to start from; null to start empty. */
    chart: SemanticChartAsCode | null;
    /** Editing a chart already in the Document, rather than adding one. */
    isEditing: boolean;
    onApply: (chart: SemanticChartAsCode) => void;
    onClose: () => void;
};

type ChartForm = UseFormReturnType<{ name: string; description: string }>;

const CHART_FORM_ID = 'document-chart-editor-form';

const CancelChartEditing = () => {
    const { requestClose } = useMantineModalClose();
    return (
        <Button variant="default" onClick={requestClose}>
            Cancel
        </Button>
    );
};

const EditorSession = ({
    onApply,
    onClose,
    onExploreSelect,
    onBackToTables,
    form,
    isEditing,
}: Props & {
    onExploreSelect: (tableName: string) => void;
    onBackToTables: () => void;
    form: ChartForm;
}) => {
    useExplorerQueryEffects();
    const version = useExplorerSelector(selectUnsavedChartVersionForSave);
    const isValidQuery = useExplorerSelector(selectIsValidQuery);
    const [initialVersion] = useState(version);
    const [confirmTableChange, setConfirmTableChange] = useState<
        (() => void) | null
    >(null);
    // The visualization normalises chart config once results arrive, so only
    // the query-defining parts count as user changes
    const dirty =
        form.isDirty() ||
        !deepEqual(
            getQuerySignature(initialVersion),
            getQuerySignature(version),
        );
    const rightSidebar = useChartGalleryRightSidebar({ enabled: true });
    const applyChart = form.onSubmit(({ name, description }) => {
        if (!isValidQuery || !name.trim()) {
            return;
        }
        onApply(getDocumentChartFromVersion(version, name.trim(), description));
    });
    useBeforeUnload((event) => {
        if (dirty) {
            event.preventDefault();
            event.returnValue = '';
        }
    });
    return (
        <MantineModal
            opened
            fullScreen
            title={isEditing ? 'Edit chart' : 'Add chart'}
            onClose={onClose}
            confirmBeforeClose={dirty}
            cancelLabel={false}
            modalBodyProps={{ px: 0, py: 0 }}
            headerActions={
                <Group gap="sm">
                    <CancelChartEditing />
                    <Button
                        type="submit"
                        form={CHART_FORM_ID}
                        disabled={!isValidQuery || !form.values.name.trim()}
                        // Anchor for scope walkthroughs (data-tour-via)
                        data-tour-anchor="document-chart-apply"
                        data-tour-hint="Click Apply to Document"
                    >
                        Apply to Document
                    </Button>
                </Group>
            }
        >
            <ModalHostedContext.Provider value={{ isModalHosted: true }}>
                <Page
                    withContainerHeight
                    withFullHeight
                    withPaddedContent
                    sidebar={
                        <ExploreSideBar
                            onExploreClick={(explore) =>
                                onExploreSelect(explore.name)
                            }
                            onBackToTables={onBackToTables}
                            onBeforeBackToTables={(proceed) => {
                                if (isValidQuery) {
                                    setConfirmTableChange(() => proceed);
                                } else {
                                    proceed();
                                }
                            }}
                        />
                    }
                    {...rightSidebar}
                >
                    <Stack
                        gap="md"
                        // Walkthrough: write a document. A look at the dialog
                        // before its clicks. See scripts/scope-tours.
                        data-tour-scope="manage:Document"
                        data-tour-look="1"
                        data-tour-after='[data-tour-anchor="document-add-chart"]'
                        data-tour-label="The Add chart dialog is a full Explore view"
                        data-tour-docs="explore/documents.mdx#add-and-arrange-charts:2"
                    >
                        <form id={CHART_FORM_ID} onSubmit={applyChart}>
                            <Group align="end">
                                <TextInput
                                    label="Chart name"
                                    // Typed anchor for scope walkthroughs (data-tour-via)
                                    data-tour-anchor="document-chart-name"
                                    data-tour-hint="Name the chart"
                                    data-tour-input="true"
                                    data-tour-suggest="Orders by country"
                                    {...form.getInputProps('name')}
                                />
                                <TextInput
                                    label="Description"
                                    {...form.getInputProps('description')}
                                />
                                <RefreshButton />
                            </Group>
                        </form>
                        <Explorer hideHeader />
                    </Stack>
                </Page>
            </ModalHostedContext.Provider>
            {confirmTableChange && (
                <MantineModal
                    opened
                    title="Change chart table?"
                    description="Changing tables clears the current chart query and configuration. The chart name and description will be kept."
                    onClose={() => setConfirmTableChange(null)}
                    cancelLabel="Keep editing"
                    confirmLabel="Change table"
                    onConfirm={confirmTableChange}
                />
            )}
        </MantineModal>
    );
};

const ChartStore = ({
    chart,
    tableName,
    ...props
}: Props & {
    tableName: string;
    onExploreSelect: (tableName: string) => void;
    onBackToTables: () => void;
    form: ChartForm;
    isEditing: boolean;
}) => {
    const [store] = useState(() =>
        createExplorerStore({
            explorer: buildDocumentChartEditorState(chart, tableName),
        }),
    );
    return (
        <Provider store={store}>
            <EditorSession chart={chart} {...props} />
        </Provider>
    );
};

const DocumentChartEditorModal = (props: Props) => {
    const [tableName, setTableName] = useState(props.chart?.tableName ?? '');
    const [initialChart, setInitialChart] = useState(props.chart);
    const form = useForm({
        initialValues: {
            name: props.chart?.name ?? '',
            description: props.chart?.description ?? '',
        },
    });
    return (
        <ChartStore
            key={tableName}
            {...props}
            chart={initialChart}
            tableName={tableName}
            form={form}
            onExploreSelect={setTableName}
            onBackToTables={() => {
                setInitialChart(null);
                setTableName('');
            }}
        />
    );
};

export default DocumentChartEditorModal;
