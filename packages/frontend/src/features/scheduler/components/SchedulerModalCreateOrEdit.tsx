import {
    type ApiError,
    type CreateSchedulerAndTargetsWithoutIds,
    type ItemsMap,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type SchedulerAndTargets,
} from '@lightdash/common';
import {
    Box,
    Button,
    Loader,
    LoadingOverlay,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { IconBell, IconChevronLeft, IconSend } from '@tabler/icons-react';
import { type UseMutationResult } from '@tanstack/react-query';
import { type FC } from 'react';
import ErrorState from '../../../components/common/ErrorState';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import DocumentationHelpButton from '../../../components/DocumentationHelpButton';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useSchedulerFormModal } from '../hooks/useSchedulerFormModal';
import SchedulerForm from './SchedulerForm';
import {
    SchedulerFormProvider,
    type SchedulerFormValues,
} from './SchedulerForm/schedulerFormContext';

interface Props {
    resourceUuid: string;
    createMutation: UseMutationResult<
        SchedulerAndTargets,
        ApiError,
        { resourceUuid: string; data: CreateSchedulerAndTargetsWithoutIds }
    >;
    onClose: () => void;
    onBack: () => void;
    isChart?: boolean;
    isApp?: boolean;
    isThresholdAlert?: boolean;
    itemsMap?: ItemsMap;
    currentParameterValues?: ParametersValuesMap;
    availableParameters?: ParameterDefinitions;
    /** undefined = create mode, string = edit mode */
    schedulerUuidToEdit: string | undefined;
    /** Create-mode only: pre-fills the new delivery. */
    initialFormValues?: Partial<SchedulerFormValues>;
}

export const SchedulerModalCreateOrEdit: FC<Props> = ({
    resourceUuid,
    createMutation,
    schedulerUuidToEdit,
    initialFormValues,
    isChart = false,
    isApp,
    isThresholdAlert,
    itemsMap,
    currentParameterValues,
    availableParameters,
    onClose,
    onBack,
}) => {
    // URL param handling is done in SchedulerModal parent component
    const schedulerUuid = schedulerUuidToEdit;
    const projectUuid = useProjectUuid();

    const {
        isLoading,
        error,
        isLoadingSendNow,
        isMutating,
        savedSchedulerData,
        formResource,
        handleSubmit,
        handleSendNow,
        confirmText,
        form,
        dashboard,
        isThresholdAlertWithNoFields,
        numericMetrics,
        isDashboardTabsAvailable,
        requiredFiltersWithoutValues,
    } = useSchedulerFormModal({
        schedulerUuid,
        resourceUuid,
        isChart,
        isApp,
        isThresholdAlert,
        createMutation,
        onBack,
        itemsMap,
        currentParameterValues,
        initialFormValues,
    });

    return (
        <SchedulerFormProvider form={form}>
            <MantineModal
                opened
                onClose={onClose}
                size="xl"
                title={isThresholdAlert ? 'Alerts' : 'Scheduled deliveries'}
                icon={isThresholdAlert ? IconBell : IconSend}
                modalBodyProps={{ px: 0, py: 0, bg: 'background' }}
                headerActions={
                    isThresholdAlert ? (
                        <DocumentationHelpButton href="https://docs.lightdash.com/guides/how-to-create-alerts" />
                    ) : (
                        <DocumentationHelpButton href="https://docs.lightdash.com/guides/how-to-create-scheduled-deliveries" />
                    )
                }
                leftActions={
                    <Button
                        onClick={onBack}
                        variant="subtle"
                        leftSection={<MantineIcon icon={IconChevronLeft} />}
                        disabled={isLoadingSendNow || isMutating || isLoading}
                    >
                        Back
                    </Button>
                }
                actions={
                    !(isLoading || error) && (
                        <>
                            {!isThresholdAlert && (
                                <Button
                                    variant="light"
                                    leftSection={
                                        <MantineIcon icon={IconSend} />
                                    }
                                    onClick={handleSendNow}
                                    loading={
                                        isLoadingSendNow ||
                                        isMutating ||
                                        isLoading
                                    }
                                    disabled={
                                        !Boolean(
                                            (form.values.slackTargets?.length ||
                                                0 ||
                                                form.values.emailTargets
                                                    ?.length ||
                                                0 ||
                                                form.values.msTeamsTargets
                                                    ?.length ||
                                                0 ||
                                                form.values.googleChatTargets
                                                    ?.length ||
                                                0) &&
                                            requiredFiltersWithoutValues.length ===
                                                0,
                                        )
                                    }
                                >
                                    Send now
                                </Button>
                            )}
                            <Tooltip
                                label={
                                    requiredFiltersWithoutValues.length > 0
                                        ? 'Some required filters are missing values'
                                        : undefined
                                }
                                disabled={
                                    !(
                                        isThresholdAlertWithNoFields ||
                                        requiredFiltersWithoutValues.length > 0
                                    ) ||
                                    !(requiredFiltersWithoutValues.length > 0)
                                }
                                fz="xs"
                            >
                                <Box>
                                    <Button
                                        type="submit"
                                        form="scheduler-form"
                                        disabled={
                                            isLoadingSendNow ||
                                            isThresholdAlertWithNoFields ||
                                            requiredFiltersWithoutValues.length >
                                                0
                                        }
                                        loading={isMutating || isLoading}
                                    >
                                        {confirmText}
                                    </Button>
                                </Box>
                            </Tooltip>
                        </>
                    )
                }
                cancelLabel={false}
            >
                <Box mih="550px">
                    {isLoading || error ? (
                        <Box m="xl">
                            {isLoading ? (
                                <Stack h={300} w="100%" align="center">
                                    <Text fw={600}>Loading scheduler</Text>
                                    <Loader size="lg" />
                                </Stack>
                            ) : error ? (
                                <ErrorState error={error.error} />
                            ) : null}
                        </Box>
                    ) : (
                        <>
                            <LoadingOverlay
                                visible={
                                    isLoadingSendNow || isMutating || isLoading
                                }
                                overlayProps={{ blur: 1 }}
                            />
                            <SchedulerForm
                                resource={formResource}
                                savedSchedulerData={savedSchedulerData}
                                isThresholdAlert={isThresholdAlert}
                                projectUuid={projectUuid}
                                onSubmit={handleSubmit}
                                onSendNow={handleSendNow}
                                loading={isMutating || isLoading}
                                itemsMap={itemsMap}
                                currentParameterValues={currentParameterValues}
                                availableParameters={availableParameters}
                                dashboard={dashboard}
                                isThresholdAlertWithNoFields={
                                    !!isThresholdAlertWithNoFields
                                }
                                numericMetrics={numericMetrics}
                                isDashboardTabsAvailable={
                                    isDashboardTabsAvailable
                                }
                            />
                        </>
                    )}
                </Box>
            </MantineModal>
        </SchedulerFormProvider>
    );
};
