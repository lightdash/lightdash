import { FeatureFlags } from '@lightdash/common';
import {
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
import { IconChartBar, IconPlus } from '@tabler/icons-react';
import { useEffect, useMemo } from 'react';
import { z } from 'zod';
import MantineIcon from '../../../components/common/MantineIcon';
import SaveToSpaceForm from '../../../components/common/modal/ChartCreateModal/SaveToSpaceForm';
import { saveToSpaceSchema } from '../../../components/common/modal/ChartCreateModal/types';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import { useModalSteps } from '../../../hooks/useModalSteps';
import { useSpaceManagement } from '../../../hooks/useSpaceManagement';
import { useSpaceSummaries } from '../../../hooks/useSpaces';
import {
    useSavedSqlChart,
    useUpdateSqlChartMutation,
} from '../hooks/useSavedSqlCharts';

enum ModalStep {
    InitialInfo = 'initialInfo',
    SelectDestination = 'selectDestination',
}

const updateSqlChartSchema = z
    .object({
        name: z.string().min(1),
        description: z.string().nullable(),
    })
    .merge(saveToSpaceSchema);

type FormValues = z.infer<typeof updateSqlChartSchema>;

type Props = Pick<ModalProps, 'opened' | 'onClose'> & {
    projectUuid: string;
    savedSqlUuid: string;
    slug: string;
    onSuccess: () => void;
};

export const UpdateSqlChartModal = ({
    projectUuid,
    savedSqlUuid,
    slug,
    opened,
    onClose,
    onSuccess,
}: Props) => {
    const isNestedSpacesEnabled = useFeatureFlagEnabled(
        FeatureFlags.NestedSpaces,
    );
    const {
        data,
        isLoading: isChartLoading,
        isSuccess: isChartSuccess,
    } = useSavedSqlChart({
        projectUuid,
        uuid: savedSqlUuid,
    });

    const { data: spaces = [], isLoading: isSpacesLoading } = useSpaceSummaries(
        projectUuid,
        true,
    );

    const spaceManagement = useSpaceManagement({
        projectUuid,
        defaultSpaceUuid: data?.space.uuid,
    });

    const { isCreatingNewSpace, openCreateSpaceForm } = spaceManagement;

    const form = useForm<FormValues>({
        initialValues: {
            name: '',
            description: null,
            spaceUuid: null,
            newSpaceName: null,
        },
        validate: zodResolver(updateSqlChartSchema),
    });

    const modalSteps = useModalSteps<ModalStep>(ModalStep.InitialInfo, {
        validators: {
            [ModalStep.InitialInfo]: () => !!form.values.name,
        },
    });

    const { mutateAsync: updateChart, isLoading: isSavingChart } =
        useUpdateSqlChartMutation(projectUuid, savedSqlUuid, slug);

    useEffect(() => {
        if (isChartSuccess && data) {
            const values = {
                name: data.name,
                description: data.description,
                spaceUuid: data.space.uuid,
                newSpaceName: null,
            };

            form.setValues(values);
            form.resetDirty(values);
        }
        // form can't be a dependency because it will cause infinite loop
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, isChartSuccess]);

    const handleOnSubmit = form.onSubmit(
        async ({ name, description, spaceUuid, newSpaceName }) => {
            let newSpace = newSpaceName
                ? await spaceManagement.handleCreateNewSpace({
                      isPrivate: true,
                  })
                : undefined;

            await updateChart({
                unversionedData: {
                    name,
                    description: description ?? null,
                    spaceUuid: newSpace?.uuid || spaceUuid || spaces[0]?.uuid,
                },
            });

            onSuccess();
        },
    );

    const handleNextStep = () => {
        modalSteps.goToStep(ModalStep.SelectDestination);
    };

    const handleBack = () => {
        modalSteps.goToStep(ModalStep.InitialInfo);
    };

    const shouldShowNewSpaceButton = useMemo(
        () =>
            isNestedSpacesEnabled &&
            modalSteps.currentStep === ModalStep.SelectDestination &&
            !isCreatingNewSpace,
        [isNestedSpacesEnabled, modalSteps.currentStep, isCreatingNewSpace],
    );

    const isFormReadyToSave = useMemo(
        () =>
            modalSteps.currentStep === ModalStep.SelectDestination &&
            form.values.name &&
            (form.values.newSpaceName || form.values.spaceUuid),
        [
            modalSteps.currentStep,
            form.values.name,
            form.values.newSpaceName,
            form.values.spaceUuid,
        ],
    );

    const isLoading = isSavingChart || isChartLoading || isSpacesLoading;

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            keepMounted={false}
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconChartBar} size="lg" color="gray.7" />
                    <Text fw={500}>Update chart</Text>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            <form onSubmit={handleOnSubmit}>
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
                            isLoading={isLoading}
                            spaceManagement={spaceManagement}
                            selectedSpaceName={
                                spaces.find(
                                    (space) =>
                                        space.uuid === form.values.spaceUuid,
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

                    <Button
                        onClick={onClose}
                        variant="outline"
                        disabled={isLoading}
                    >
                        Cancel
                    </Button>

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
        </Modal>
    );
};
