import { ChartKind } from '@lightdash/common';
import { Button, Stack, TextInput, Textarea } from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconChartBar, IconPlus } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, type FC } from 'react';
import { z } from 'zod';
import { selectCompleteConfigByKind } from '../../../components/DataViz/store/selectors';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal, {
    type MantineModalProps,
} from '../../../components/common/MantineModal';
import SaveToSpaceForm from '../../../components/common/modal/ChartCreateModal/SaveToSpaceForm';
import { saveToSpaceSchema } from '../../../components/common/modal/ChartCreateModal/types';
import { useModalSteps } from '../../../hooks/useModalSteps';
import { useSpaceManagement } from '../../../hooks/useSpaceManagement';
import { useSpaceSummaries } from '../../../hooks/useSpaces';
import { DEFAULT_SQL_LIMIT } from '../constants';
import { useCreateSqlChartMutation } from '../hooks/useSavedSqlCharts';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { EditorTabs, updateName } from '../store/sqlRunnerSlice';
import { SqlQueryBeforeSaveAlert } from './SqlQueryBeforeSaveAlert';

enum ModalStep {
    Warning = 'warning',
    InitialInfo = 'initialInfo',
    SelectDestination = 'selectDestination',
}

const saveChartFormSchema = z
    .object({
        name: z.string().min(1),
        description: z.string().nullable(),
    })
    .merge(saveToSpaceSchema);

type FormValues = z.infer<typeof saveChartFormSchema>;

type Props = Pick<MantineModalProps, 'opened' | 'onClose'>;

const SAVE_CHART_FORM_ID = 'save-sql-chart-form';

export const SaveSqlChartModal: FC<Props> = ({ opened, onClose }) => {
    const dispatch = useAppDispatch();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const hasUnrunChanges = useAppSelector(
        (state) => state.sqlRunner.hasUnrunChanges,
    );

    const name = useAppSelector((state) => state.sqlRunner.name);
    const description = useAppSelector((state) => state.sqlRunner.description);

    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const limit = useAppSelector((state) => state.sqlRunner.limit);

    const selectedChartType = useAppSelector(
        (state) => state.sqlRunner.selectedChartType,
    );

    const activeEditorTab = useAppSelector(
        (state) => state.sqlRunner.activeEditorTab,
    );

    const currentVizConfig = useAppSelector((state) =>
        selectCompleteConfigByKind(
            state,
            activeEditorTab === EditorTabs.SQL
                ? ChartKind.TABLE
                : selectedChartType,
        ),
    );

    const initialStep = hasUnrunChanges
        ? ModalStep.Warning
        : ModalStep.InitialInfo;

    const form = useForm<FormValues>({
        initialValues: {
            name: '',
            description: null,
            spaceUuid: null,
            newSpaceName: null,
        },
        validate: zodResolver(saveChartFormSchema),
    });

    const modalSteps = useModalSteps<ModalStep>(initialStep, {
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
    } = useSpaceSummaries(projectUuid, true);

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

    const {
        mutateAsync: createSavedSqlChart,
        isLoading: isCreatingSavedSqlChart,
    } = useCreateSqlChartMutation(projectUuid);

    const handleOnSubmit = useCallback(async () => {
        if (spaces.length === 0) {
            return;
        }
        let newSpace = form.values.newSpaceName
            ? await handleCreateNewSpace({
                  isPrivate: true,
              })
            : undefined;
        const spaceUuid =
            newSpace?.uuid || form.values.spaceUuid || spaces[0].uuid;

        if (currentVizConfig && sql) {
            try {
                await createSavedSqlChart({
                    name: form.values.name,
                    description: form.values.description || '',
                    sql,
                    limit: limit ?? DEFAULT_SQL_LIMIT,
                    config: currentVizConfig,
                    spaceUuid: spaceUuid,
                });

                dispatch(updateName(form.values.name));
                onClose();
            } catch (_) {
                // Error is handled in useCreateSqlChartMutation
            }
        }
    }, [
        spaces,
        form.values.newSpaceName,
        form.values.spaceUuid,
        form.values.name,
        form.values.description,
        handleCreateNewSpace,
        currentVizConfig,
        sql,
        createSavedSqlChart,
        limit,
        dispatch,
        onClose,
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
            sql,
        [
            modalSteps.currentStep,
            form.values.name,
            form.values.newSpaceName,
            form.values.spaceUuid,
            sql,
        ],
    );

    const isLoading =
        isLoadingSpace ||
        isCreatingSavedSqlChart ||
        spaceManagement.createSpaceMutation.isLoading;

    const renderActions = () => {
        if (modalSteps.currentStep === ModalStep.Warning) {
            return (
                <Button
                    onClick={() => modalSteps.goToStep(ModalStep.InitialInfo)}
                >
                    Next
                </Button>
            );
        }

        if (modalSteps.currentStep === ModalStep.InitialInfo) {
            return (
                <Button onClick={handleNextStep} disabled={!form.values.name}>
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
            cancelLabel={
                modalSteps.currentStep === ModalStep.Warning ? false : undefined
            }
            leftActions={renderLeftActions()}
            actions={renderActions()}
        >
            {modalSteps.currentStep === ModalStep.Warning && (
                <SqlQueryBeforeSaveAlert />
            )}

            {modalSteps.currentStep !== ModalStep.Warning && (
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
                            isLoading={
                                isLoadingSpace || isCreatingSavedSqlChart
                            }
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
            )}
        </MantineModal>
    );
};
