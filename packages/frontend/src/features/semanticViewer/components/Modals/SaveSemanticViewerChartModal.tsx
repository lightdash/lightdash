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
import { useDisclosure } from '@mantine/hooks';
import { IconChartBar } from '@tabler/icons-react';
import { useCallback, useEffect, type FC } from 'react';
import { z } from 'zod';
import MantineIcon from '../../../../components/common/MantineIcon';
import SaveToSpaceForm, {
    saveToSpaceSchema,
} from '../../../../components/common/modal/ChartCreateModal/SaveToSpaceForm';
import { selectCompleteConfigByKind } from '../../../../components/DataViz/store/selectors';
import useToaster from '../../../../hooks/toaster/useToaster';
import {
    useCreateMutation as useSpaceCreateMutation,
    useSpaceSummaries,
} from '../../../../hooks/useSpaces';
import { useAppDispatch, useAppSelector } from '../../../sqlRunner/store/hooks';
import { useCreateSemanticViewerChartMutation } from '../../api/hooks';
import {
    selectSemanticLayerInfo,
    selectSemanticLayerQuery,
} from '../../store/selectors';
import {
    updateName,
    updateSaveModalOpen,
} from '../../store/semanticViewerSlice';

const saveSemanticViewerChartSchema = z
    .object({
        name: z.string().min(1),
        description: z.string().nullable(),
    })
    .merge(saveToSpaceSchema);

type FormValues = z.infer<typeof saveSemanticViewerChartSchema>;

type Props = {
    onSave: (slug: string) => void;
};

const SaveSemanticViewerChartModal: FC<Props> = ({ onSave }) => {
    const dispatch = useAppDispatch();
    const [opened, { close }] = useDisclosure(true);
    const { projectUuid } = useAppSelector(selectSemanticLayerInfo);
    const name = useAppSelector((state) => state.semanticViewer.name);
    const semanticLayerView = useAppSelector(
        (state) => state.semanticViewer.semanticLayerView,
    );
    const semanticLayerQuery = useAppSelector(selectSemanticLayerQuery);

    const activeChartKind = useAppSelector(
        (state) => state.semanticViewer.activeChartKind,
    );
    const selectedChartConfig = useAppSelector((state) =>
        selectCompleteConfigByKind(state, activeChartKind),
    );

    const spacesQuery = useSpaceSummaries(projectUuid, true);

    const spaceCreateMutation = useSpaceCreateMutation(projectUuid);

    const form = useForm<FormValues>({
        validate: zodResolver(saveToSpaceSchema),
    });

    const handleClose = useCallback(() => {
        close();

        setTimeout(() => {
            dispatch(updateSaveModalOpen(false));
        }, 300);
    }, [close, dispatch]);

    useEffect(() => {
        if (spacesQuery.isSuccess && !form.initialized) {
            form.initialize({
                name,
                description: null,
                newSpaceName: null,
                spaceUuid: spacesQuery.data[0].uuid ?? null,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [spacesQuery]);

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
        if (!spacesQuery.isSuccess) return;
        if (!hasConfigAndQuery) return;

        let newSpace = form.values.newSpaceName
            ? await spaceCreateMutation.mutateAsync({
                  name: form.values.newSpaceName,
                  access: [],
                  isPrivate: true,
              })
            : undefined;

        const spaceUuid =
            newSpace?.uuid || form.values.spaceUuid || spacesQuery.data[0].uuid;

        const newChart = await saveChart({
            name: form.values.name,
            description: form.values.description || '',
            semanticLayerView: semanticLayerView ?? null,
            semanticLayerQuery,
            config: selectedChartConfig,
            spaceUuid: spaceUuid,
        });

        dispatch(updateName(form.values.name));

        handleClose();
        onSave(newChart.slug);
    }, [
        spacesQuery.isSuccess,
        spacesQuery.data,
        hasConfigAndQuery,
        form.values.newSpaceName,
        form.values.spaceUuid,
        form.values.name,
        form.values.description,
        spaceCreateMutation,
        saveChart,
        semanticLayerView,
        semanticLayerQuery,
        selectedChartConfig,
        dispatch,
        handleClose,
        onSave,
    ]);

    return (
        <Modal
            opened={opened}
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
                            value={form.values.name ?? ''}
                        />
                        <Textarea
                            label="Description"
                            {...form.getInputProps('description')}
                            value={form.values.description ?? ''}
                        />
                    </Stack>

                    <SaveToSpaceForm
                        form={form}
                        isLoading={
                            isSaving ||
                            spacesQuery.isLoading ||
                            spaceCreateMutation.isLoading
                        }
                        spaces={spacesQuery.data}
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

export default SaveSemanticViewerChartModal;
