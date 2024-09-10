import {
    Button,
    Group,
    Modal,
    Stack,
    Text,
    Textarea,
    TextInput,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconChartBar } from '@tabler/icons-react';
import { useCallback, useEffect, useState, type FC } from 'react';
import { type z } from 'zod';
import MantineIcon from '../../../../components/common/MantineIcon';
import {
    SaveDestination,
    SaveToSpace,
    validationSchema,
} from '../../../../components/common/modal/ChartCreateModal/SaveToSpaceOrDashboard';
import { selectChartConfigByKind } from '../../../../components/DataViz/store/selectors';
import useToaster from '../../../../hooks/toaster/useToaster';
import {
    useCreateMutation as useSpaceCreateMutation,
    useSpaceSummaries,
} from '../../../../hooks/useSpaces';
import { useCreateSemanticViewerChartMutation } from '../../api/hooks';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
    selectSemanticLayerInfo,
    selectSemanticLayerQuery,
} from '../../store/selectors';
import {
    updateName,
    updateSaveModalOpen,
} from '../../store/semanticViewerSlice';

type FormValues = z.infer<typeof validationSchema>;

const SemanticViewerSaveChartModal: FC = () => {
    const dispatch = useAppDispatch();
    const { projectUuid } = useAppSelector(selectSemanticLayerInfo);
    const name = useAppSelector((state) => state.semanticViewer.name);
    const view = useAppSelector((state) => state.semanticViewer.view);
    const semanticLayerQuery = useAppSelector(selectSemanticLayerQuery);
    const isSavedModalOpen = useAppSelector(
        (state) => state.semanticViewer.saveModalOpen,
    );
    const activeChartKind = useAppSelector(
        (state) => state.semanticViewer.activeChartKind,
    );
    const selectedChartConfig = useAppSelector((state) =>
        selectChartConfigByKind(state, activeChartKind),
    );

    const { data: spaces = [] } = useSpaceSummaries(projectUuid, true);

    const { mutateAsync: createSpace } = useSpaceCreateMutation(projectUuid);

    const [isFormPopulated, setIsFormPopulated] = useState(false);

    const form = useForm<FormValues>({
        initialValues: {
            name: '',
            description: '',
            spaceUuid: '',
            newSpaceName: '',
            saveDestination: SaveDestination.Space,
        },
        validate: zodResolver(validationSchema),
    });

    const handleClose = useCallback(() => {
        dispatch(updateSaveModalOpen(false));
    }, [dispatch]);

    useEffect(() => {
        if (!isFormPopulated) {
            if (name) {
                form.setFieldValue('name', name);
            }
            if (spaces.length > 0) {
                form.setFieldValue('spaceUuid', spaces[0].uuid);
            }
            setIsFormPopulated(true);
        }
    }, [name, form, spaces, isFormPopulated]);

    const {
        mutateAsync: saveChart,
        isLoading: isSaving,
        isSuccess: isSaved,
        isError: isSavingError,
        error: saveError,
    } = useCreateSemanticViewerChartMutation(projectUuid, {});

    useEffect(() => {
        if (isSaved) {
            handleClose();
        }
    }, [isSaved, handleClose]);

    const { showToastApiError, showToastSuccess } = useToaster();

    useEffect(() => {
        if (isSavingError) {
            showToastApiError({
                title: `Failed to create chart`,
                apiError: saveError.error,
            });
        }
    }, [isSavingError, saveError, showToastApiError]);

    useEffect(() => {
        if (isSaved) {
            showToastSuccess({
                title: 'Chart saved successfully',
            });
        }
    }, [isSaved, showToastSuccess]);

    const hasConfigAndQuery = !!selectedChartConfig && !!semanticLayerQuery;

    const handleOnSubmit = useCallback(async () => {
        if (spaces.length === 0) return;
        if (!hasConfigAndQuery) return;

        let newSpace = form.values.newSpaceName
            ? await createSpace({
                  name: form.values.newSpaceName,
                  access: [],
                  isPrivate: true,
              })
            : undefined;

        const spaceUuid =
            newSpace?.uuid || form.values.spaceUuid || spaces[0].uuid;

        if (hasConfigAndQuery) {
            await saveChart({
                name: form.values.name,
                description: form.values.description || '',
                semanticLayerView: view ?? null,
                semanticLayerQuery,
                config: selectedChartConfig,
                spaceUuid: spaceUuid,
            });
        }

        dispatch(updateName(form.values.name));

        handleClose();
    }, [
        spaces,
        hasConfigAndQuery,
        form.values.newSpaceName,
        form.values.spaceUuid,
        form.values.name,
        form.values.description,
        createSpace,
        dispatch,
        handleClose,
        saveChart,
        view,
        semanticLayerQuery,
        selectedChartConfig,
    ]);

    return (
        <Modal
            opened={isSavedModalOpen}
            onClose={handleClose}
            keepMounted={false}
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconChartBar} size="lg" color="gray.7" />
                    <Text fw={500}>Save chart</Text>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            <form onSubmit={form.onSubmit(handleOnSubmit)}>
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
                        />
                    </Stack>
                    <SaveToSpace
                        form={form}
                        spaces={spaces}
                        projectUuid={projectUuid}
                    />
                </Stack>

                <Group
                    position="right"
                    w="100%"
                    sx={(theme) => ({
                        borderTop: `1px solid ${theme.colors.gray[4]}`,
                        bottom: 0,
                        padding: theme.spacing.md,
                    })}
                >
                    <Button
                        onClick={handleClose}
                        variant="outline"
                        disabled={isSaving}
                    >
                        Cancel
                    </Button>

                    <Button
                        type="submit"
                        disabled={!form.values.name || !hasConfigAndQuery}
                        loading={isSaving}
                    >
                        Save
                    </Button>
                </Group>
            </form>
        </Modal>
    );
};

export default SemanticViewerSaveChartModal;
