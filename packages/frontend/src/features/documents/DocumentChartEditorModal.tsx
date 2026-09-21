import {
    ChartType,
    deepEqual,
    type SemanticChartAsCode,
} from '@lightdash/common';
import { Button, Group, Stack, TextInput } from '@mantine/core';
import { useForm, type UseFormReturnType } from '@mantine/form';
import { useState } from 'react';
import { Provider } from 'react-redux';
import { useBeforeUnload } from 'react-router';
import Callout from '../../components/common/Callout';
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
} from './documentChartEditor';

type Props = {
    chart: SemanticChartAsCode | null;
    onApply: (chart: SemanticChartAsCode) => void;
    onClose: () => void;
};

type ChartForm = UseFormReturnType<{ name: string; description: string }>;

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
    isEditing: boolean;
}) => {
    useExplorerQueryEffects();
    const version = useExplorerSelector(selectUnsavedChartVersionForSave);
    const isValidQuery = useExplorerSelector(selectIsValidQuery);
    const [initialVersion] = useState(version);
    const [confirmTableChange, setConfirmTableChange] = useState<
        (() => void) | null
    >(null);
    const dirty = form.isDirty() || !deepEqual(initialVersion, version);
    const unsupported = version.chartConfig.type === ChartType.DATA_APP_VIZ;
    const rightSidebar = useChartGalleryRightSidebar({ enabled: true });
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
                        disabled={
                            !isValidQuery ||
                            !form.values.name.trim() ||
                            unsupported
                        }
                        onClick={() => {
                            const result = getDocumentChartFromVersion(
                                version,
                                form.values.name.trim(),
                                form.values.description,
                            );
                            if (result) {
                                onApply(result);
                            }
                        }}
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
                    <Stack gap="md">
                        <Group align="end">
                            <TextInput
                                label="Chart name"
                                {...form.getInputProps('name')}
                            />
                            <TextInput
                                label="Description"
                                {...form.getInputProps('description')}
                            />
                            <RefreshButton />
                        </Group>
                        {unsupported && (
                            <Callout variant="warning">
                                Custom chart types are not supported in
                                Documents. Choose a built-in chart type to
                                apply.
                            </Callout>
                        )}
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
            isEditing={props.chart !== null}
            onExploreSelect={setTableName}
            onBackToTables={() => {
                setInitialChart(null);
                setTableName('');
            }}
        />
    );
};

export default DocumentChartEditorModal;
