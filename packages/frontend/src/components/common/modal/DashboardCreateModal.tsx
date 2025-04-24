import { subject } from '@casl/ability';
import { FeatureFlags, type Dashboard, type Space } from '@lightdash/common';
import {
    Button,
    Group,
    MantineProvider,
    Stack,
    TextInput,
    Textarea,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconLayoutDashboard, IconPlus } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, type FC } from 'react';
import { useCreateMutation } from '../../../hooks/dashboard/useDashboard';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import { useModalSteps } from '../../../hooks/useModalSteps';
import { useSpaceManagement } from '../../../hooks/useSpaceManagement';
import { useSpaceSummaries } from '../../../hooks/useSpaces';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../MantineIcon';
import MantineModal from '../MantineModal';
import SaveToSpaceForm from './ChartCreateModal/SaveToSpaceForm';

enum ModalStep {
    InitialInfo = 'initialInfo',
    SelectDestination = 'selectDestination',
}

interface DashboardCreateModalProps {
    opened: ModalProps['opened'];
    onClose: ModalProps['onClose'];
    projectUuid: string;
    defaultSpaceUuid?: string;
    onConfirm?: (dashboard: Dashboard) => void;
}

const DashboardCreateModal: FC<DashboardCreateModalProps> = ({
    projectUuid,
    defaultSpaceUuid,
    onConfirm,
    onClose,
    ...modalProps
}) => {
    const { user } = useApp();
    const isNestedSpacesEnabled = useFeatureFlagEnabled(
        FeatureFlags.NestedSpaces,
    );
    const { mutateAsync: createDashboard, isLoading: isCreatingDashboard } =
        useCreateMutation(projectUuid);

    const form = useForm({
        initialValues: {
            dashboardName: '',
            dashboardDescription: '',
            spaceUuid: '',
            newSpaceName: null,
        },
    });

    const modalSteps = useModalSteps<ModalStep>(ModalStep.InitialInfo, {
        validators: {
            [ModalStep.InitialInfo]: () => !!form.values.dashboardName,
        },
    });

    const spaceManagement = useSpaceManagement({
        projectUuid,
        defaultSpaceUuid,
    });

    const { isCreatingNewSpace, openCreateSpaceForm } = spaceManagement;

    const {
        data: spaces,
        isInitialLoading: isLoadingSpaces,
        isSuccess,
    } = useSpaceSummaries(projectUuid, true, {
        staleTime: 0,
        select: (data) => {
            // Only get spaces that the user can create dashboards to
            return data.filter((space) =>
                user.data?.ability.can(
                    'create',
                    subject('Dashboard', {
                        ...space,
                        access: space.userAccess ? [space.userAccess] : [],
                    }),
                ),
            );
        },
        onSuccess: (data) => {
            if (data.length > 0) {
                const currentSpace = defaultSpaceUuid
                    ? data.find((space) => space.uuid === defaultSpaceUuid)
                    : data[0];
                return currentSpace?.uuid
                    ? form.setFieldValue('spaceUuid', currentSpace?.uuid)
                    : null;
            }
        },
    });

    const handleClose = () => {
        form.reset();
        onClose?.();
    };

    const { setFieldValue } = form;

    useEffect(() => {
        if (isSuccess && modalProps.opened) {
            setFieldValue(
                'spaceUuid',
                spaces?.find((space) => space.uuid === defaultSpaceUuid)
                    ?.uuid ??
                    ((spaces && spaces[0]?.uuid) || ''),
            );
        }
    }, [defaultSpaceUuid, isSuccess, modalProps.opened, setFieldValue, spaces]);

    const handleConfirm = useCallback(
        async (data: typeof form.values) => {
            let newSpace: Space | undefined;

            if (data.newSpaceName) {
                newSpace = await spaceManagement.handleCreateNewSpace({
                    isPrivate: false,
                });
            }

            const dashboard = await createDashboard({
                name: data.dashboardName,
                description: data.dashboardDescription,
                spaceUuid: newSpace?.uuid || data.spaceUuid,
                tiles: [],
                tabs: [], // add default tab
            });
            onConfirm?.(dashboard);

            form.reset();
        },
        [createDashboard, onConfirm, form, spaceManagement],
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
            form.values.dashboardName &&
            (form.values.newSpaceName || form.values.spaceUuid),
        [
            modalSteps.currentStep,
            form.values.dashboardName,
            form.values.newSpaceName,
            form.values.spaceUuid,
        ],
    );

    const isLoading =
        isCreatingDashboard ||
        isLoadingSpaces ||
        spaceManagement.createSpaceMutation.isLoading;

    if (isLoadingSpaces || !spaces) return null;

    return (
        <MantineProvider inherit theme={{ colorScheme: 'light' }}>
            <MantineModal
                {...modalProps}
                title="Create Dashboard"
                icon={IconLayoutDashboard}
                onClose={() => handleClose()}
                actions={
                    <Group position="right" w="100%">
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
                            size="sm"
                            variant="outline"
                            color="gray"
                            onClick={handleClose}
                        >
                            Cancel
                        </Button>

                        {modalSteps.currentStep === ModalStep.InitialInfo ? (
                            <Button
                                size="sm"
                                onClick={handleNextStep}
                                disabled={!form.values.dashboardName}
                            >
                                Next
                            </Button>
                        ) : (
                            <>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleBack}
                                >
                                    Back
                                </Button>
                                <Button
                                    size="sm"
                                    disabled={!isFormReadyToSave}
                                    loading={isCreatingDashboard}
                                    type="submit"
                                    form="dashboard-create-modal"
                                    data-testid="dashboard-create-modal-create-button"
                                >
                                    Create
                                </Button>
                            </>
                        )}
                    </Group>
                }
            >
                <form
                    id="dashboard-create-modal"
                    title="Create Dashboard"
                    onSubmit={form.onSubmit((values) => handleConfirm(values))}
                >
                    {modalSteps.currentStep === ModalStep.InitialInfo && (
                        <Stack>
                            <TextInput
                                label="Name your dashboard"
                                placeholder="eg. KPI Dashboard"
                                disabled={isCreatingDashboard}
                                required
                                {...form.getInputProps('dashboardName')}
                            />
                            <Textarea
                                label="Dashboard description"
                                placeholder="A few words to give your team some context"
                                disabled={isCreatingDashboard}
                                autosize
                                maxRows={3}
                                {...form.getInputProps('dashboardDescription')}
                            />
                        </Stack>
                    )}

                    {modalSteps.currentStep === ModalStep.SelectDestination && (
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
                    )}
                </form>
            </MantineModal>
        </MantineProvider>
    );
};

export default DashboardCreateModal;
