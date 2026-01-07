import {
    getMetricsFromItemsMap,
    getTableCalculationsFromItemsMap,
    isNumericItem,
    type ApiError,
    type CreateSchedulerAndTargets,
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
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useLocation, useNavigate } from 'react-router';
import ErrorState from '../../../components/common/ErrorState';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import DocumentationHelpButton from '../../../components/DocumentationHelpButton';
import { useDashboardQuery } from '../../../hooks/dashboard/useDashboard';
import useUser from '../../../hooks/user/useUser';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { isInvalidCronExpression } from '../../../utils/fieldValidators';
import { useScheduler, useSendNowScheduler } from '../hooks/useScheduler';
import { useSchedulersUpdateMutation } from '../hooks/useSchedulersUpdateMutation';
import {
    getSchedulerUuidFromUrlParams,
    getThresholdUuidFromUrlParams,
} from '../utils';
import SchedulerForm from './SchedulerForm';
import {
    DEFAULT_VALUES,
    DEFAULT_VALUES_ALERT,
    getFormValuesFromScheduler,
    getSelectedTabsForDashboardScheduler,
    SchedulerFormProvider,
    transformFormValues,
    useSchedulerForm,
} from './SchedulerForm/schedulerFormContext';
import { Limit } from './types';

interface UseSchedulerFormModalProps {
    schedulerUuid: string | undefined; // undefined = create, string = edit
    resourceUuid: string;
    isChart: boolean;
    isThresholdAlert?: boolean;
    createMutation: UseMutationResult<
        SchedulerAndTargets,
        ApiError,
        { resourceUuid: string; data: CreateSchedulerAndTargetsWithoutIds }
    >;
    onBack: () => void;
    itemsMap?: ItemsMap;
    currentParameterValues?: ParametersValuesMap;
}

const useSchedulerFormModal = ({
    schedulerUuid,
    resourceUuid,
    isChart,
    isThresholdAlert,
    createMutation,
    onBack,
    itemsMap,
    currentParameterValues,
}: UseSchedulerFormModalProps) => {
    const isEditMode = !!schedulerUuid;

    // For edit mode - fetch existing scheduler
    const scheduler = useScheduler(schedulerUuid ?? '', {
        enabled: isEditMode,
    });

    // For edit mode - update mutation
    const updateMutation = useSchedulersUpdateMutation(schedulerUuid ?? '');

    // Shared hooks
    const { data: user } = useUser(true);
    const { track } = useTracking();
    const { mutate: sendNow, isLoading: isLoadingSendNow } =
        useSendNowScheduler();

    // Resource prop for form
    const formResource = useMemo(
        () =>
            isEditMode
                ? scheduler.data?.dashboardUuid ||
                  scheduler.data?.savedChartUuid
                    ? {
                          type: (scheduler.data.dashboardUuid
                              ? 'dashboard'
                              : 'chart') as 'dashboard' | 'chart',
                          uuid:
                              scheduler.data.dashboardUuid ??
                              scheduler.data.savedChartUuid,
                      }
                    : undefined
                : {
                      type: (isChart ? 'chart' : 'dashboard') as
                          | 'dashboard'
                          | 'chart',
                      uuid: resourceUuid,
                  },
        [isEditMode, scheduler.data, isChart, resourceUuid],
    );

    const isDashboard = formResource?.type === 'dashboard';
    const { data: dashboard } = useDashboardQuery(formResource?.uuid, {
        enabled: !!isDashboard && !!formResource?.uuid,
    });

    const isDashboardTabsAvailable =
        dashboard?.tabs !== undefined && dashboard.tabs.length > 1;

    // Use the explicitly passed parameter values
    const dashboardParameterValues = currentParameterValues || {};

    const form = useSchedulerForm({
        initialValues:
            scheduler.data !== undefined
                ? getFormValuesFromScheduler({
                      ...scheduler.data,
                      ...getSelectedTabsForDashboardScheduler(
                          scheduler.data,
                          isDashboardTabsAvailable,
                          dashboard,
                      ),
                  })
                : isThresholdAlert
                ? DEFAULT_VALUES_ALERT
                : {
                      ...DEFAULT_VALUES,
                      selectedTabs: isDashboardTabsAvailable
                          ? dashboard?.tabs.map((tab) => tab.uuid)
                          : null,
                      parameters:
                          isDashboard &&
                          Object.keys(dashboardParameterValues).length > 0
                              ? dashboardParameterValues
                              : undefined,
                  },
        validateInputOnBlur: ['options.customLimit'],

        validate: {
            name: (value) => {
                return value.length > 0 ? null : 'Name is required';
            },
            options: {
                customLimit: (value, values) => {
                    return values.options.limit === Limit.CUSTOM &&
                        !Number.isInteger(value)
                        ? 'Custom limit must be an integer'
                        : null;
                },
            },
            filters: (value) => {
                if (!value) {
                    // Dashboard filters are undefined/null for charts
                    return null;
                }
                const requiredFiltersWithoutValues = value.filter(
                    (filter) =>
                        filter.required &&
                        (!filter.values || filter.values.length === 0),
                );

                if (requiredFiltersWithoutValues.length > 0) {
                    return `Required filters must have values`;
                }
                return null;
            },
            cron: (cronExpression) => {
                return isInvalidCronExpression('Cron expression')(
                    cronExpression,
                );
            },
            selectedTabs: (value) => {
                if (value && value.length === 0) {
                    return 'Selected tabs should not be empty';
                }
                return null;
            },
        },
    });

    const numericMetrics = useMemo(
        () => ({
            ...getMetricsFromItemsMap(itemsMap ?? {}, isNumericItem),
            ...getTableCalculationsFromItemsMap(itemsMap),
        }),
        [itemsMap],
    );

    const isThresholdAlertWithNoFields =
        isThresholdAlert && Object.keys(numericMetrics).length === 0;

    const requiredFiltersWithoutValues = (form.values.filters ?? []).filter(
        (filter) =>
            filter.required && (!filter.values || filter.values.length === 0),
    );

    // Sync form values when data is loaded
    useEffect(() => {
        if (scheduler.data) {
            form.setValues(
                getFormValuesFromScheduler({
                    ...scheduler.data,
                    ...getSelectedTabsForDashboardScheduler(
                        scheduler.data,
                        isDashboardTabsAvailable,
                        dashboard,
                    ),
                }),
            );
            form.resetDirty();
        }
        // We only want to sync when the data actually arrives or dashboard changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scheduler.data, isDashboardTabsAvailable, dashboard]);

    // Handle mutation success
    useEffect(() => {
        if (isEditMode && updateMutation.isSuccess) {
            updateMutation.reset();
            onBack();
        }
    }, [isEditMode, updateMutation, onBack]);

    useEffect(() => {
        if (!isEditMode && createMutation.isSuccess) {
            createMutation.reset();
            onBack();
        }
    }, [isEditMode, createMutation, onBack]);

    // Submit handler
    const handleSubmit = useCallback(
        (values: typeof form.values) => {
            const data = transformFormValues(values, formResource?.type);
            if (isEditMode) {
                updateMutation.mutate(data);
            } else {
                createMutation.mutate({ resourceUuid, data });
            }
        },
        [
            isEditMode,
            updateMutation,
            createMutation,
            resourceUuid,
            formResource?.type,
            form,
        ],
    );

    // Send now handler
    const handleSendNow = useCallback(() => {
        if (!form.isValid()) {
            form.validate();
            return;
        }
        if (user?.userUuid === undefined) return;
        if (isEditMode && scheduler.data === undefined) return;

        const schedulerData = transformFormValues(
            form.values,
            formResource?.type,
        );

        const resource = isEditMode
            ? {
                  savedChartUuid: scheduler.data?.savedChartUuid ?? null,
                  dashboardUuid: scheduler.data?.dashboardUuid ?? null,
              }
            : isChart
            ? { savedChartUuid: resourceUuid, dashboardUuid: null }
            : { dashboardUuid: resourceUuid, savedChartUuid: null };

        const unsavedScheduler: CreateSchedulerAndTargets = {
            ...schedulerData,
            ...resource,
            createdBy: user.userUuid,
        };

        track({ name: EventName.SCHEDULER_SEND_NOW_BUTTON });
        sendNow(unsavedScheduler);
    }, [
        form,
        isEditMode,
        scheduler.data,
        isChart,
        resourceUuid,
        user,
        track,
        sendNow,
        formResource?.type,
    ]);

    const isMutating = isEditMode
        ? updateMutation.isLoading
        : createMutation.isLoading;

    const confirmText = isEditMode
        ? 'Save'
        : isThresholdAlert
        ? 'Create alert'
        : 'Create schedule';

    return {
        isEditMode,
        isLoading: isEditMode ? scheduler.isInitialLoading : false,
        error: isEditMode ? scheduler.error : null,
        isLoadingSendNow,
        isMutating,
        savedSchedulerData: isEditMode ? scheduler.data : undefined,
        formResource,
        handleSubmit,
        handleSendNow,
        confirmText,
        // Added these
        form,
        dashboard,
        isThresholdAlertWithNoFields,
        numericMetrics,
        isDashboardTabsAvailable,
        requiredFiltersWithoutValues,
    };
};

interface Props {
    resourceUuid: string;
    createMutation: UseMutationResult<
        SchedulerAndTargets,
        ApiError,
        { resourceUuid: string; data: CreateSchedulerAndTargetsWithoutIds }
    >;
    onClose: () => void;
    onBack: () => void;
    isChart: boolean;
    isThresholdAlert?: boolean;
    itemsMap?: ItemsMap;
    currentParameterValues?: ParametersValuesMap;
    availableParameters?: ParameterDefinitions;
    /** undefined = create mode, string = edit mode */
    schedulerUuidToEdit: string | undefined;
}

export const SchedulerModalCreateOrEdit: FC<Props> = ({
    resourceUuid,
    createMutation,
    schedulerUuidToEdit,
    isChart,
    isThresholdAlert,
    itemsMap,
    currentParameterValues,
    availableParameters,
    onClose,
    onBack,
}) => {
    const [schedulerUuid, setSchedulerUuid] = useState<string | undefined>(
        schedulerUuidToEdit,
    );
    const navigate = useNavigate();
    const { search, pathname } = useLocation();

    // Handle URL params for deep linking to edit
    useEffect(() => {
        const schedulerUuidFromUrlParams =
            getSchedulerUuidFromUrlParams(search);
        if (schedulerUuidFromUrlParams) {
            setSchedulerUuid(schedulerUuidFromUrlParams);

            // remove from url param after modal is open
            const newParams = new URLSearchParams(search);
            newParams.delete('scheduler_uuid');
            void navigate(
                {
                    pathname,
                    search: newParams.toString(),
                },
                { replace: true },
            );
        } else {
            const thresholdUuidFromUrlParams =
                getThresholdUuidFromUrlParams(search);
            if (thresholdUuidFromUrlParams) {
                setSchedulerUuid(thresholdUuidFromUrlParams);

                // remove from url param after modal is open
                const newParams = new URLSearchParams(search);
                newParams.delete('threshold_uuid');
                void navigate(
                    {
                        pathname,
                        search: newParams.toString(),
                    },
                    { replace: true },
                );
            }
        }
    }, [navigate, pathname, search]);

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
        isThresholdAlert,
        createMutation,
        onBack,
        itemsMap,
        currentParameterValues,
    });

    console.log(form.values);

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
