import {
    FeatureFlags,
    getMetricsFromItemsMap,
    getTableCalculationsFromItemsMap,
    isNumericItem,
    SchedulerFormat,
    type ApiError,
    type CreateSchedulerAndTargets,
    type CreateSchedulerAndTargetsWithoutIds,
    type ItemsMap,
    type ParametersValuesMap,
    type SchedulerAndTargets,
} from '@lightdash/common';
import { type UseMutationResult } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { useAiAgentButtonVisibility } from '../../../ee/features/aiCopilot/hooks/useAiAgentsButtonVisibility';
import { useDashboardQuery } from '../../../hooks/dashboard/useDashboard';
import useToaster from '../../../hooks/toaster/useToaster';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import useUser from '../../../hooks/user/useUser';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { isInvalidCronExpression } from '../../../utils/fieldValidators';
import {
    DEFAULT_VALUES,
    DEFAULT_VALUES_ALERT,
    getFormValuesFromScheduler,
    getSelectedTabsForDashboardScheduler,
    transformFormValues,
    useSchedulerForm,
    type SchedulerFormValues,
} from '../components/SchedulerForm/schedulerFormContext';
import { Limit } from '../components/types';
import { getSchedulerFilterRequirements } from '../utils/filterRequirements';
import { useScheduler, useSendNowScheduler } from './useScheduler';
import {
    useSchedulerAiAugmentation,
    useSchedulerAiAugmentationDeleteMutation,
    useSchedulerAiAugmentationUpsertMutation,
} from './useSchedulerAiAugmentation';
import { useSchedulersUpdateMutation } from './useSchedulersUpdateMutation';

export interface UseSchedulerFormModalProps {
    schedulerUuid: string | undefined; // undefined = create, string = edit
    resourceUuid: string;
    isChart?: boolean;
    isApp?: boolean;
    isThresholdAlert?: boolean;
    createMutation: UseMutationResult<
        SchedulerAndTargets,
        ApiError,
        { resourceUuid: string; data: CreateSchedulerAndTargetsWithoutIds }
    >;
    onBack: () => void;
    itemsMap?: ItemsMap;
    currentParameterValues?: ParametersValuesMap;
    initialFormValues?: Partial<SchedulerFormValues>;
}

export const useSchedulerFormModal = ({
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
}: UseSchedulerFormModalProps) => {
    const isEditMode = !!schedulerUuid;

    // For edit mode - fetch existing scheduler
    const scheduler = useScheduler(schedulerUuid ?? '', {
        enabled: isEditMode,
    });

    // For edit mode - update mutation
    const updateMutation = useSchedulersUpdateMutation(schedulerUuid ?? '');

    // For edit mode - existing AI augmentation (separate sub-resource).
    // Gated on AI visibility so OSS/unentitled instances never call the
    // EE-only endpoint.
    const isAiVisible = useAiAgentButtonVisibility();
    const aiAugmentation = useSchedulerAiAugmentation(schedulerUuid, {
        enabled: isAiVisible,
    });
    const upsertAiAugmentationMutation =
        useSchedulerAiAugmentationUpsertMutation();
    const deleteAiAugmentationMutation =
        useSchedulerAiAugmentationDeleteMutation();

    // Shared hooks
    const { data: user } = useUser(true);
    const { track } = useTracking();
    const { showToastApiError } = useToaster();
    const { mutate: sendNow, isLoading: isLoadingSendNow } =
        useSendNowScheduler();

    // Resource prop for form
    const formResource = useMemo(() => {
        if (isEditMode) {
            if (scheduler.data?.appUuid) {
                return {
                    type: 'app' as const,
                    uuid: scheduler.data.appUuid,
                };
            }
            if (
                scheduler.data?.dashboardUuid ||
                scheduler.data?.savedChartUuid
            ) {
                return {
                    type: scheduler.data.dashboardUuid
                        ? ('dashboard' as const)
                        : ('chart' as const),
                    uuid:
                        scheduler.data.dashboardUuid ??
                        scheduler.data.savedChartUuid,
                };
            }
            return undefined;
        }
        if (isApp) {
            return { type: 'app' as const, uuid: resourceUuid };
        }
        return {
            type: (isChart ? 'chart' : 'dashboard') as 'dashboard' | 'chart',
            uuid: resourceUuid,
        };
    }, [isEditMode, scheduler.data, isApp, isChart, resourceUuid]);

    const projectUuid = useProjectUuid();
    const isDashboard = formResource?.type === 'dashboard';
    const { data: dashboard } = useDashboardQuery({
        uuidOrSlug: formResource?.uuid,
        projectUuid,
        useQueryOptions: {
            enabled: !!isDashboard && !!formResource?.uuid,
        },
    });

    const isDashboardTabsAvailable =
        dashboard?.tabs !== undefined && dashboard.tabs.length > 1;

    const { data: filterRequirementsFlag } = useServerFeatureFlag(
        FeatureFlags.DashboardFilterRequirements,
    );
    const isFilterRequirementsEnabled =
        filterRequirementsFlag?.enabled === true;

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
                        // Apps only support image deliveries
                        format: isApp
                            ? SchedulerFormat.IMAGE
                            : DEFAULT_VALUES.format,
                        selectedTabs: isDashboardTabsAvailable
                            ? dashboard?.tabs.map((tab) => tab.uuid)
                            : null,
                        parameters:
                            isDashboard &&
                            Object.keys(dashboardParameterValues).length > 0
                                ? dashboardParameterValues
                                : undefined,
                        ...initialFormValues,
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
            dashboardFilters: (value) => {
                if (!value) {
                    // Dashboard filters are undefined/null for charts
                    return null;
                }
                const { unmetRequirements, filtersWithUnmetRequirements } =
                    getSchedulerFilterRequirements(
                        dashboard?.filters,
                        value,
                        isFilterRequirementsEnabled,
                    );

                if (filtersWithUnmetRequirements.length > 0) {
                    return unmetRequirements.every(
                        (requirement) => requirement.type === 'group',
                    )
                        ? 'Set a value for at least one filter in each requirement group'
                        : 'Required filters must have values';
                }
                return null;
            },
            cron: (cronExpression) => {
                return isInvalidCronExpression('Cron expression')(
                    cronExpression,
                );
            },
            thresholds: {
                fieldId: (value) => (value ? null : 'Alert field is required'),
            },
            selectedTabs: (value) => {
                if (value && value.length === 0) {
                    return 'Selected tabs should not be empty';
                }
                return null;
            },
            aiAugmentation: (value) =>
                value && value.prompt.trim().length === 0
                    ? 'Instructions are required'
                    : null,
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

    const {
        unmetRequirements,
        filtersWithUnmetRequirements: requiredFiltersWithoutValues,
    } = getSchedulerFilterRequirements(
        dashboard?.filters,
        form.values.dashboardFilters,
        isFilterRequirementsEnabled,
    );
    const hasOnlyUnmetGroupRequirements =
        unmetRequirements.length > 0 &&
        unmetRequirements.every((requirement) => requirement.type === 'group');

    // Sync form values when data is loaded. The AI augmentation is omitted —
    // it loads via a separate query and is synced by the effect below, so a
    // late scheduler/dashboard sync can't clobber it.
    useEffect(() => {
        if (scheduler.data) {
            const { aiAugmentation: _initialAiAugmentation, ...formValues } =
                getFormValuesFromScheduler({
                    ...scheduler.data,
                    ...getSelectedTabsForDashboardScheduler(
                        scheduler.data,
                        isDashboardTabsAvailable,
                        dashboard,
                    ),
                });
            form.setValues(formValues);
            form.resetDirty();
        }
        // We only want to sync when the data actually arrives or dashboard changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scheduler.data, isDashboardTabsAvailable, dashboard]);

    // Sync only the AI augmentation when its sub-resource resolves, leaving
    // any in-progress edits to the rest of the form untouched.
    useEffect(() => {
        if (
            aiAugmentation.data !== undefined &&
            !form.isDirty('aiAugmentation')
        ) {
            const wasDirty = form.isDirty();
            form.setFieldValue('aiAugmentation', aiAugmentation.data ?? null);
            if (!wasDirty) {
                form.resetDirty();
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aiAugmentation.data]);

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
        async (values: typeof form.values) => {
            const data = transformFormValues(values, formResource?.type);
            let saved: SchedulerAndTargets;
            try {
                saved = isEditMode
                    ? await updateMutation.mutateAsync(data)
                    : await createMutation.mutateAsync({ resourceUuid, data });
            } catch {
                // The mutation's onError already toasts; stop before the AI
                // step so the rejection doesn't escape the submit handler.
                return;
            }

            // AI augmentation is a separate sub-resource; persist it after the
            // scheduler exists. A failure here doesn't undo the saved delivery.
            try {
                if (values.aiAugmentation) {
                    await upsertAiAugmentationMutation.mutateAsync({
                        schedulerUuid: saved.schedulerUuid,
                        augmentation: values.aiAugmentation,
                    });
                } else if (isEditMode && aiAugmentation.data) {
                    // Only delete an augmentation known to exist — never while
                    // its GET is still pending or errored, and never on OSS
                    // where the EE endpoint is absent.
                    await deleteAiAugmentationMutation.mutateAsync({
                        schedulerUuid: saved.schedulerUuid,
                    });
                }
            } catch (e) {
                showToastApiError({
                    title: 'Failed to save the AI settings for this delivery',
                    apiError: (e as ApiError).error,
                });
            }
        },
        [
            isEditMode,
            updateMutation,
            createMutation,
            resourceUuid,
            formResource?.type,
            showToastApiError,
            aiAugmentation.data,
            upsertAiAugmentationMutation,
            deleteAiAugmentationMutation,
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

        let resource: {
            savedChartUuid: string | null;
            dashboardUuid: string | null;
            savedSqlUuid: string | null;
            appUuid: string | null;
        };
        if (isEditMode) {
            resource = {
                savedChartUuid: scheduler.data?.savedChartUuid ?? null,
                dashboardUuid: scheduler.data?.dashboardUuid ?? null,
                savedSqlUuid: scheduler.data?.savedSqlUuid ?? null,
                appUuid: scheduler.data?.appUuid ?? null,
            };
        } else if (isApp) {
            resource = {
                appUuid: resourceUuid,
                savedChartUuid: null,
                dashboardUuid: null,
                savedSqlUuid: null,
            };
        } else if (isChart) {
            resource = {
                savedChartUuid: resourceUuid,
                dashboardUuid: null,
                savedSqlUuid: null,
                appUuid: null,
            };
        } else {
            resource = {
                dashboardUuid: resourceUuid,
                savedChartUuid: null,
                savedSqlUuid: null,
                appUuid: null,
            };
        }

        const unsavedScheduler: CreateSchedulerAndTargets = {
            ...schedulerData,
            ...resource,
            createdBy: user.userUuid,
            // Carry the (possibly unsaved) AI settings so send-now runs them.
            aiAugmentation: form.values.aiAugmentation,
        };

        track({ name: EventName.SCHEDULER_SEND_NOW_BUTTON });
        sendNow(unsavedScheduler);
    }, [
        form,
        isEditMode,
        scheduler.data,
        isChart,
        isApp,
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
        form,
        dashboard,
        isThresholdAlertWithNoFields,
        numericMetrics,
        isDashboardTabsAvailable,
        requiredFiltersWithoutValues,
        hasOnlyUnmetGroupRequirements,
    };
};
