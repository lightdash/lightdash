import { subject } from '@casl/ability';
import { type Dashboard, type Space } from '@lightdash/common';
import {
    Button,
    LoadingOverlay,
    Stack,
    Textarea,
    TextInput,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconLayoutDashboard, IconPlus } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateMutation } from '../../../hooks/dashboard/useDashboard';
import { useContentAuthoringEnabled } from '../../../hooks/useContentAuthoringEnabled';
import { useModalSteps } from '../../../hooks/useModalSteps';
import { useSpaceManagement } from '../../../hooks/useSpaceManagement';
import { useSpaceSummaries } from '../../../hooks/useSpaces';
import useApp from '../../../providers/App/useApp';
import MantineBaseProvider from '../../../providers/MantineBaseProvider';
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
    const { t } = useTranslation('modals');
    const authoringEnabled = useContentAuthoringEnabled();
    const { user } = useApp();
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

    const { isCreatingNewSpace, openCreateSpaceForm, setSelectedSpaceUuid } =
        spaceManagement;

    const {
        data: spaces,
        isInitialLoading: isLoadingSpaces,
        isSuccess,
    } = useSpaceSummaries(projectUuid, true, {
        staleTime: 0,
        enabled: modalProps.opened, // Only fetch when modal is open
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
    });

    const handleClose = () => {
        form.reset();
        onClose?.();
    };

    const { setFieldValue } = form;

    useEffect(() => {
        if (!isSuccess || !modalProps.opened) {
            return;
        }
        let defaultSpace = spaces?.find(
            (space) => space.uuid === defaultSpaceUuid,
        );

        if (!defaultSpace) {
            defaultSpace = spaces?.find((space) => !space.parentSpaceUuid);
        }

        const uuid = defaultSpace?.uuid ?? '';

        setFieldValue('spaceUuid', uuid);
        setSelectedSpaceUuid(uuid);
    }, [
        defaultSpaceUuid,
        isSuccess,
        modalProps.opened,
        setFieldValue,
        spaces,
        setSelectedSpaceUuid,
    ]);

    const handleConfirm = useCallback(
        async (data: typeof form.values) => {
            let newSpace: Space | undefined;

            if (data.newSpaceName) {
                newSpace = await spaceManagement.handleCreateNewSpace({
                    inheritParentPermissions: true,
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
            modalSteps.currentStep === ModalStep.SelectDestination &&
            !isCreatingNewSpace,
        [modalSteps.currentStep, isCreatingNewSpace],
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

    if (!authoringEnabled) return null;

    return (
        <MantineBaseProvider>
            <MantineModal
                {...modalProps}
                title={t('dashboardCreate.title')}
                icon={IconLayoutDashboard}
                onClose={() => handleClose()}
                modalRootProps={{ keepMounted: false }}
                leftActions={
                    shouldShowNewSpaceButton ? (
                        <Button
                            variant="subtle"
                            size="xs"
                            leftSection={<MantineIcon icon={IconPlus} />}
                            onClick={openCreateSpaceForm}
                        >
                            {t('newSpace')}
                        </Button>
                    ) : null
                }
                actions={
                    modalSteps.currentStep === ModalStep.InitialInfo ? (
                        <Button
                            onClick={handleNextStep}
                            disabled={!form.values.dashboardName}
                            data-testid="DashboardCreateModal/Next"
                            data-tour-anchor="dashboard-create-next"
                            data-tour-hint="Click Next"
                        >
                            {t('actions.next', { ns: 'common' })}
                        </Button>
                    ) : (
                        <>
                            <Button variant="default" onClick={handleBack}>
                                {t('actions.back', { ns: 'common' })}
                            </Button>
                            <Button
                                disabled={!isFormReadyToSave}
                                loading={isCreatingDashboard}
                                type="submit"
                                form="dashboard-create-modal"
                                data-tour-anchor="dashboard-create-submit"
                                data-tour-hint="Click Create"
                            >
                                {t('actions.create', { ns: 'common' })}
                            </Button>
                        </>
                    )
                }
            >
                <LoadingOverlay visible={isLoading} />
                <form
                    id="dashboard-create-modal"
                    title={t('dashboardCreate.title')}
                    onSubmit={form.onSubmit((values) => handleConfirm(values))}
                >
                    {modalSteps.currentStep === ModalStep.InitialInfo && (
                        <Stack>
                            <TextInput
                                label={t('dashboardCreate.nameLabel')}
                                placeholder={t(
                                    'dashboardCreate.namePlaceholder',
                                )}
                                disabled={isCreatingDashboard}
                                required
                                // Walkthrough: a typed step; the card offers
                                // a name to use in one click.
                                data-tour-anchor="dashboard-name"
                                data-tour-input="true"
                                data-tour-hint="Name your dashboard"
                                data-tour-suggest="Orders overview"
                                {...form.getInputProps('dashboardName')}
                            />
                            <Textarea
                                label={t('dashboardCreate.descriptionLabel')}
                                placeholder={t('descriptionPlaceholder')}
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
        </MantineBaseProvider>
    );
};

export default DashboardCreateModal;
