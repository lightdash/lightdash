import { ChartKind } from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Modal,
    Stack,
    Text,
    TextInput,
    Textarea,
    type ModalProps,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconArrowBack, IconChartBar, IconPlus } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, type FC } from 'react';
import { z } from 'zod';
import { selectCompleteConfigByKind } from '../../../components/DataViz/store/selectors';
import MantineIcon from '../../../components/common/MantineIcon';
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

type Props = Pick<ModalProps, 'opened' | 'onClose'>;

const SaveChartForm: FC<Pick<Props, 'onClose'>> = ({ onClose }) => {
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

    return (
        <form onSubmit={form.onSubmit(handleOnSubmit)}>
            {modalSteps.currentStep === ModalStep.InitialInfo && (
                <Stack p="md">
                    <Stack spacing="xs">
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
                </Stack>
            )}

            {modalSteps.currentStep === ModalStep.SelectDestination && (
                <Stack p="md">
                    <SaveToSpaceForm
                        form={form}
                        spaces={spaces}
                        projectUuid={projectUuid}
                        isLoading={isLoadingSpace || isCreatingSavedSqlChart}
                        spaceManagement={spaceManagement}
                        selectedSpaceName={
                            spaces.find(
                                (space) => space.uuid === form.values.spaceUuid,
                            )?.name
                        }
                    />
                </Stack>
            )}

            <Group
                position="right"
                w="100%"
                sx={(theme) => ({
                    borderTop: `1px solid ${theme.colors.gray[4]}`,
                    bottom: 0,
                    padding: theme.spacing.md,
                })}
            >
                {shouldShowNewSpaceButton && (
                    <Button
                        variant="subtle"
                        size="xs"
                        leftIcon={<MantineIcon icon={IconPlus} />}
                        onClick={openCreateSpaceForm}
                        mr="auto"
                    >
                        New Space
                    </Button>
                )}

                {hasUnrunChanges && (
                    <Button
                        leftIcon={<MantineIcon icon={IconArrowBack} />}
                        variant="outline"
                        onClick={() => modalSteps.goToStep(ModalStep.Warning)}
                    >
                        Back
                    </Button>
                )}

                {modalSteps.currentStep === ModalStep.InitialInfo ? (
                    <Button
                        onClick={handleNextStep}
                        disabled={!form.values.name}
                    >
                        Next
                    </Button>
                ) : (
                    <>
                        <Button onClick={handleBack} variant="outline">
                            Back
                        </Button>
                        <Button
                            type="submit"
                            disabled={!isFormReadyToSave}
                            loading={isLoading}
                        >
                            Save
                        </Button>
                    </>
                )}
            </Group>
        </form>
    );
};

export const SaveSqlChartModal: FC<Props> = ({ opened, onClose }) => {
    const hasUnrunChanges = useAppSelector(
        (state) => state.sqlRunner.hasUnrunChanges,
    );

    const initialStep = hasUnrunChanges
        ? ModalStep.Warning
        : ModalStep.InitialInfo;
    const modalSteps = useModalSteps<ModalStep>(initialStep);

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            keepMounted={false}
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconChartBar} size="lg" color="gray.7" />
                    <Text fw={500}>Save Chart</Text>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            {modalSteps.currentStep === ModalStep.Warning ? (
                <Box>
                    <SqlQueryBeforeSaveAlert />
                    <Group
                        position="right"
                        w="100%"
                        sx={(theme) => ({
                            borderTop: `1px solid ${theme.colors.gray[4]}`,
                            bottom: 0,
                            padding: theme.spacing.md,
                        })}
                    >
                        <Button onClick={onClose} variant="outline">
                            Cancel
                        </Button>

                        <Button
                            onClick={() =>
                                modalSteps.goToStep(ModalStep.InitialInfo)
                            }
                        >
                            Next
                        </Button>
                    </Group>
                </Box>
            ) : (
                <SaveChartForm onClose={onClose} />
            )}
        </Modal>
    );
};
