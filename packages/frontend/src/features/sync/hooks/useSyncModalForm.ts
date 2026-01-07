import { SchedulerFormat, isSchedulerGsheetsOptions } from '@lightdash/common';
import { useCallback, useEffect } from 'react';
import { useChartSchedulerCreateMutation } from '../../../features/scheduler/hooks/useChartSchedulers';
import { useScheduler } from '../../../features/scheduler/hooks/useScheduler';
import { useSchedulersUpdateMutation } from '../../../features/scheduler/hooks/useSchedulersUpdateMutation';
import { isInvalidCronExpression } from '../../../utils/fieldValidators';
import {
    DEFAULT_VALUES,
    useSyncModalForm as useSyncModalFormInstance,
    type SyncModalFormValues,
} from '../components/syncModalFormContext';
import { SyncModalAction } from '../providers/types';
import { useSyncModal } from '../providers/useSyncModal';

export const useSyncModalForm = (chartUuid: string) => {
    const { action, setAction, currentSchedulerUuid } = useSyncModal();

    const isEditing = action === SyncModalAction.EDIT;
    const {
        data: schedulerData,
        isInitialLoading: isLoadingSchedulerData,
        isError: isSchedulerError,
        error: schedulerError,
    } = useScheduler(currentSchedulerUuid ?? '', {
        enabled: !!currentSchedulerUuid && isEditing,
    });

    const {
        mutate: updateChartSync,
        isLoading: isUpdateChartSyncLoading,
        isSuccess: isUpdateChartSyncSuccess,
    } = useSchedulersUpdateMutation(currentSchedulerUuid ?? '');
    const {
        mutate: createChartSync,
        isLoading: isCreateChartSyncLoading,
        isSuccess: isCreateChartSyncSuccess,
    } = useChartSchedulerCreateMutation();

    const isLoading = isCreateChartSyncLoading || isUpdateChartSyncLoading;
    const isSuccess = isCreateChartSyncSuccess || isUpdateChartSyncSuccess;

    const form = useSyncModalFormInstance({
        initialValues: DEFAULT_VALUES,
        validate: {
            name: (value) => (value.length > 0 ? null : 'Name is required'),
            cron: (value) => isInvalidCronExpression('Cron expression')(value),
            options: {
                tabName: (value, values) => {
                    if (values.saveInNewTab) {
                        if (!value) return 'Tab name is required';
                        if (value.toLowerCase() === 'metadata') {
                            return 'Tab name cannot be "metadata"';
                        }
                    }
                    return null;
                },
            },
        },
    });

    useEffect(() => {
        if (schedulerData && isEditing) {
            form.setValues({
                name: schedulerData.name,
                cron: schedulerData.cron,
                timezone: schedulerData.timezone || undefined,
                options: {
                    gdriveId: isSchedulerGsheetsOptions(schedulerData.options)
                        ? schedulerData.options.gdriveId
                        : '',
                    gdriveName: isSchedulerGsheetsOptions(schedulerData.options)
                        ? schedulerData.options.gdriveName
                        : '',
                    gdriveOrganizationName: isSchedulerGsheetsOptions(
                        schedulerData.options,
                    )
                        ? schedulerData.options.gdriveOrganizationName || ''
                        : '',
                    url: isSchedulerGsheetsOptions(schedulerData.options)
                        ? schedulerData.options.url
                        : '',
                    tabName: isSchedulerGsheetsOptions(schedulerData.options)
                        ? schedulerData.options.tabName || ''
                        : '',
                },
                saveInNewTab:
                    isSchedulerGsheetsOptions(schedulerData.options) &&
                    !!schedulerData.options.tabName,
            });
            form.resetDirty();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEditing, schedulerData]);

    const handleSubmit = useCallback(
        (values: SyncModalFormValues) => {
            const defaultNewSchedulerValues = {
                format: SchedulerFormat.GSHEETS,
                enabled: true,
                targets: [],
                // TODO: Related to scheduled deliveries, not syncs. Irrelevant.
                includeLinks: false,
            };

            const payload = {
                name: values.name,
                cron: values.cron,
                timezone: values.timezone || undefined,
                ...defaultNewSchedulerValues,
                options: {
                    ...values.options,
                    tabName: values.saveInNewTab
                        ? values.options.tabName
                        : undefined,
                },
            };

            if (isEditing) {
                updateChartSync(payload);
            } else {
                createChartSync({
                    resourceUuid: chartUuid,
                    data: payload,
                });
            }
        },
        [chartUuid, createChartSync, isEditing, updateChartSync],
    );

    useEffect(() => {
        if (isSuccess) {
            form.reset();
            setAction(SyncModalAction.VIEW);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSuccess, setAction]);

    return {
        form,
        handleSubmit,
        isLoading,
        isEditing,
        isLoadingSchedulerData,
        isSchedulerError,
        schedulerError,
    };
};
