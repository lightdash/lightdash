import { subject } from '@casl/ability';
import {
    ChartType,
    type ChartConfig,
    type CreateSavedChartVersion,
    type ResultColumnItems,
    type ResultColumns,
    type SavedChart,
} from '@lightdash/common';
import { Button, Stack, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconChartBar, IconPlus } from '@tabler/icons-react';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { useCallback, useEffect, useMemo, type FC } from 'react';
import { z } from 'zod';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal, {
    type MantineModalProps,
} from '../../../components/common/MantineModal';
import SaveToSpaceForm from '../../../components/common/modal/ChartCreateModal/SaveToSpaceForm';
import { saveToSpaceSchema } from '../../../components/common/modal/ChartCreateModal/types';
import useToaster from '../../../hooks/toaster/useToaster';
import { useModalSteps } from '../../../hooks/useModalSteps';
import { useCreateMutation } from '../../../hooks/useSavedQuery';
import { useSpaceManagement } from '../../../hooks/useSpaceManagement';
import { useSpaceSummaries } from '../../../hooks/useSpaces';
import useApp from '../../../providers/App/useApp';
import { DEFAULT_SQL_LIMIT } from '../constants';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
    EditorTabs,
    selectConnectionRequest,
    updateName,
    type SqlRunnerConnectionRequest,
} from '../store/sqlRunnerSlice';
import { buildSqlRunnerSavedChartVersion } from '../viz/sqlRunnerSavedChart';
import { useSqlRunnerPivotConfiguration } from '../viz/useSqlRunnerPivotConfiguration';

enum ModalStep {
    InitialInfo = 'initialInfo',
    SelectDestination = 'selectDestination',
}

const saveChartFormSchema = z
    .object({
        name: z.string().min(1, 'Name is required'),
        description: z.string().nullable(),
    })
    .merge(saveToSpaceSchema);

type FormValues = z.infer<typeof saveChartFormSchema>;

type Props = Pick<MantineModalProps, 'opened' | 'onClose'>;

const SAVE_CHART_FORM_ID = 'save-sql-chart-form';

/** What the SQL runner saves: the statement and the chart as drawn over the last run's columns. */
export type SqlRunnerChartToSave = {
    sql: string;
    limit: number;
    columns: ResultColumns;
    items: ResultColumnItems;
    chartConfig: ChartConfig;
    pivotDimensions: string[] | undefined;
};

type SaveSqlChartModalContentProps = Props & {
    projectUuid: string;
    name: string;
    description: string | null;
    chart: SqlRunnerChartToSave;
    connectionRequest: SqlRunnerConnectionRequest;
    redirectOnSuccess?: boolean;
    onSaved?: (chart: SavedChart, name: string) => void | Promise<void>;
};

/**
 * Walkthrough action for manage:SqlRunner (with manage:CustomSql): saving a
 * chart built in the SQL runner.
 */
const saveTourAction = {
    'data-tour-scope': 'manage:SqlRunner',
    'data-tour-covers': 'manage:CustomSql',
    'data-tour-step': '2',
    'data-tour-route': '/projects/:projectUuid/sql-runner',
    'data-tour-label': 'Save the chart',
    'data-tour-title': 'Run SQL and save a chart',
    'data-tour-interactive': 'true',
    'data-tour-via':
        '[data-tour-nav="new"] >> [data-tour-nav="new-sql-runner"] >> [data-tour-anchor="sql-runner-editor"] >> [data-tour-anchor="sql-runner-run"] >> [data-tour-anchor="sql-save-chart"] >> [data-tour-anchor="sql-chart-name"] >> [data-tour-anchor="sql-chart-save-next"] >> [data-tour-anchor="space-option"][data-tour-value="Shared"]',
    'data-tour-docs':
        'explore/sql-runner.mdx#saved-charts-in-the-sql-runner:p3:1',
};

export const SaveSqlChartModalContent: FC<SaveSqlChartModalContentProps> = ({
    opened,
    onClose,
    projectUuid,
    name,
    description,
    chart,
    connectionRequest,
    redirectOnSuccess = true,
    onSaved,
}) => {
    const { user } = useApp();
    const { showToastError } = useToaster();

    const form = useForm<FormValues>({
        initialValues: {
            name: '',
            description: null,
            spaceUuid: null,
            newSpaceName: null,
        },
        validate: zodResolver(saveChartFormSchema),
    });

    const modalSteps = useModalSteps<ModalStep>(ModalStep.InitialInfo, {
        validators: {
            [ModalStep.InitialInfo]: () => !!form.values.name,
        },
    });

    // TODO: this sometimes runs `/api/v1/projects//spaces` request
    // because initial `projectUuid` is set to '' (empty string)
    // we should handle this by creating an impossible state
    const {
        data: spaces = [],
        isLoading: isLoadingSpace,
        isSuccess: isSuccessSpace,
    } = useSpaceSummaries(projectUuid, true, {
        select: (data) =>
            data.filter((space) =>
                // Only show spaces the user can create SQL charts in
                user.data?.ability.can(
                    'create',
                    subject('SavedChart', {
                        ...space,
                        access: space.userAccess ? [space.userAccess] : [],
                    }),
                ),
            ),
    });

    const spaceManagement = useSpaceManagement({
        projectUuid,
    });

    const { handleCreateNewSpace, isCreatingNewSpace, openCreateSpaceForm } =
        spaceManagement;

    useEffect(() => {
        if (isSuccessSpace && spaces) {
            const values = {
                name,
                description,
                spaceUuid: spaces[0]?.uuid,
                newSpaceName: null,
            };
            form.setValues(values);
            form.resetDirty(values);
        }
        // form can't be a dependency because it will cause infinite loop
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [name, description, spaces, isSuccessSpace]);

    const { mutateAsync: createSavedChart, isLoading: isCreatingSavedChart } =
        useCreateMutation({
            projectUuid,
            redirectOnSuccess,
            showViewChartAction: !redirectOnSuccess,
        });

    const savedVersion = useMemo(
        (): CreateSavedChartVersion | null =>
            connectionRequest.ready
                ? buildSqlRunnerSavedChartVersion({
                      sql: chart.sql,
                      limit: chart.limit,
                      columns: chart.columns,
                      items: chart.items,
                      chartConfig: chart.chartConfig,
                      pivotDimensions: chart.pivotDimensions,
                      warehouseConnectionUuid:
                          connectionRequest.field.warehouseConnectionUuid ??
                          null,
                  })
                : null,
        [chart, connectionRequest],
    );

    const handleOnSubmit = useCallback(async () => {
        if (spaces.length === 0) {
            return;
        }
        let newSpace = form.values.newSpaceName
            ? await handleCreateNewSpace({
                  inheritParentPermissions: false,
              })
            : undefined;
        const spaceUuid =
            newSpace?.uuid || form.values.spaceUuid || spaces[0].uuid;

        if (!savedVersion) {
            showToastError({
                title: 'Choose a connection before you save this chart',
            });
            return;
        }
        try {
            const created = await createSavedChart({
                name: form.values.name,
                description: form.values.description || '',
                spaceUuid,
                tableName: savedVersion.tableName,
                metricQuery: savedVersion.metricQuery,
                chartConfig: savedVersion.chartConfig,
                tableConfig: savedVersion.tableConfig,
                pivotConfig: savedVersion.pivotConfig,
                pipeline: savedVersion.pipeline,
            });
            await onSaved?.(created, form.values.name);
            onClose();
        } catch (_) {
            // Error is handled in useCreateMutation
        }
    }, [
        spaces,
        form.values.newSpaceName,
        form.values.spaceUuid,
        form.values.name,
        form.values.description,
        handleCreateNewSpace,
        savedVersion,
        createSavedChart,
        onSaved,
        onClose,
        showToastError,
    ]);

    const handleNextStep = () => {
        modalSteps.goToStep(ModalStep.SelectDestination);
    };

    const handleBack = () => {
        modalSteps.goToStep(ModalStep.InitialInfo);
    };

    const shouldShowNewSpaceButton = useMemo(
        () =>
            modalSteps.currentStep === ModalStep.SelectDestination &&
            !isCreatingNewSpace,
        [modalSteps.currentStep, isCreatingNewSpace],
    );

    const isFormReadyToSave = useMemo(
        () =>
            modalSteps.currentStep === ModalStep.SelectDestination &&
            form.values.name &&
            (form.values.newSpaceName || form.values.spaceUuid) &&
            chart.sql,
        [
            modalSteps.currentStep,
            form.values.name,
            form.values.newSpaceName,
            form.values.spaceUuid,
            chart.sql,
        ],
    );

    const isLoading =
        isLoadingSpace ||
        isCreatingSavedChart ||
        spaceManagement.createSpaceMutation.isLoading;

    const renderActions = () => {
        if (modalSteps.currentStep === ModalStep.InitialInfo) {
            return (
                <Button
                    onClick={handleNextStep}
                    disabled={!form.values.name}
                    // Anchor for scope walkthroughs (data-tour-via)
                    data-tour-anchor="sql-chart-save-next"
                    data-tour-hint="Click Next"
                >
                    Next
                </Button>
            );
        }

        return (
            <>
                <Button onClick={handleBack} variant="outline">
                    Back
                </Button>
                <Button
                    type="submit"
                    form={SAVE_CHART_FORM_ID}
                    {...saveTourAction}
                    disabled={!isFormReadyToSave}
                    loading={isLoading}
                >
                    Save
                </Button>
            </>
        );
    };

    const renderLeftActions = () => {
        if (shouldShowNewSpaceButton) {
            return (
                <Button
                    variant="subtle"
                    size="xs"
                    leftSection={<MantineIcon icon={IconPlus} />}
                    onClick={openCreateSpaceForm}
                >
                    New Space
                </Button>
            );
        }
        return null;
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Save Chart"
            icon={IconChartBar}
            leftActions={renderLeftActions()}
            actions={renderActions()}
        >
            {
                <form
                    id={SAVE_CHART_FORM_ID}
                    onSubmit={form.onSubmit(handleOnSubmit)}
                >
                    {modalSteps.currentStep === ModalStep.InitialInfo && (
                        <Stack gap="xs">
                            <TextInput
                                label="Chart name"
                                placeholder="eg. How many weekly active users do we have?"
                                required
                                autoFocus
                                data-autofocus
                                // Typed anchor for scope walkthroughs (data-tour-via)
                                data-tour-anchor="sql-chart-name"
                                data-tour-hint="Name the chart"
                                data-tour-input="true"
                                data-tour-suggest="Orders by status"
                                {...form.getInputProps('name')}
                            />
                            <Textarea
                                label="Description"
                                {...form.getInputProps('description')}
                                value={form.values.description ?? ''}
                            />
                        </Stack>
                    )}

                    {modalSteps.currentStep === ModalStep.SelectDestination && (
                        <SaveToSpaceForm
                            form={form}
                            spaces={spaces}
                            projectUuid={projectUuid}
                            isLoading={isLoadingSpace || isCreatingSavedChart}
                            spaceManagement={spaceManagement}
                            selectedSpaceName={
                                spaces.find(
                                    (space) =>
                                        space.uuid === form.values.spaceUuid,
                                )?.name
                            }
                        />
                    )}
                </form>
            }
        </MantineModal>
    );
};

export const SaveSqlChartModal: FC<Props> = (props) => {
    const dispatch = useAppDispatch();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const name = useAppSelector((state) => state.sqlRunner.name);
    const description = useAppSelector((state) => state.sqlRunner.description);
    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const limit = useAppSelector((state) => state.sqlRunner.limit);
    const columns = useAppSelector((state) => state.sqlRunner.sqlColumns);
    const connectionRequest = useAppSelector(selectConnectionRequest);
    const chartConfig = useAppSelector((state) => state.sqlRunner.chartConfig);
    const pivotDimensions = useAppSelector(
        (state) => state.sqlRunner.pivotDimensions,
    );
    const activeEditorTab = useAppSelector(
        (state) => state.sqlRunner.activeEditorTab,
    );
    const { items } = useSqlRunnerPivotConfiguration();

    // Saving from the SQL tab saves the results as a table
    const chart = useMemo((): SqlRunnerChartToSave | null => {
        if (!columns || !items) return null;
        const isSqlTab = activeEditorTab === EditorTabs.SQL;
        return {
            sql,
            limit: limit ?? DEFAULT_SQL_LIMIT,
            columns,
            items,
            chartConfig: isSqlTab
                ? { type: ChartType.TABLE, config: undefined }
                : chartConfig,
            pivotDimensions: isSqlTab ? undefined : pivotDimensions,
        };
    }, [
        columns,
        items,
        activeEditorTab,
        sql,
        limit,
        chartConfig,
        pivotDimensions,
    ]);

    if (!chart) return null;

    return (
        <SaveSqlChartModalContent
            {...props}
            projectUuid={projectUuid}
            name={name}
            description={description}
            chart={chart}
            connectionRequest={connectionRequest}
            onSaved={(_, savedName) => {
                dispatch(updateName(savedName));
            }}
        />
    );
};
