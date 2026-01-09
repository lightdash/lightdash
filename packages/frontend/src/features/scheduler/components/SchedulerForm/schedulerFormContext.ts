import {
    isCreateSchedulerMsTeamsTarget,
    isDashboardScheduler,
    isSchedulerCsvOptions,
    isSchedulerImageOptions,
    isSlackTarget,
    NotificationFrequency,
    SchedulerFormat,
    ThresholdOperator,
    type CreateSchedulerAndTargetsWithoutIds,
    type CreateSchedulerTarget,
    type Dashboard,
    type DashboardFilterRule,
    type ParametersValuesMap,
    type SchedulerAndTargets,
    type SchedulerCsvOptions,
    type SchedulerImageOptions,
} from '@lightdash/common';
import { createFormContext } from '@mantine/form';
import intersection from 'lodash/intersection';
import { Limit, Values } from '../types';

export interface SchedulerFormValues {
    name: string;
    message: string | undefined;
    format: SchedulerFormat;
    cron: string;
    timezone: string | undefined;
    options: {
        formatted: Values;
        limit: Limit;
        customLimit: number;
        withPdf: boolean;
        asAttachment: boolean;
    };
    emailTargets: string[];
    slackTargets: string[];
    msTeamsTargets: string[];
    filters?: DashboardFilterRule[];
    parameters?: ParametersValuesMap;
    customViewportWidth?: number;
    selectedTabs?: string[] | null;
    thresholds?: Array<{
        fieldId: string;
        operator: ThresholdOperator;
        value: number;
    }>;
    includeLinks: boolean;
    notificationFrequency?: NotificationFrequency;
}

const [SchedulerFormProvider, useSchedulerFormContext, useSchedulerForm] =
    createFormContext<SchedulerFormValues>();

export { SchedulerFormProvider, useSchedulerForm, useSchedulerFormContext };

export const DEFAULT_VALUES: SchedulerFormValues = {
    name: '',
    message: '',
    format: SchedulerFormat.CSV,
    cron: '0 9 * * 1',
    timezone: undefined,
    options: {
        formatted: Values.FORMATTED,
        limit: Limit.TABLE,
        customLimit: 1,
        withPdf: false,
        asAttachment: false,
    },
    emailTargets: [],
    slackTargets: [],
    msTeamsTargets: [],
    filters: [],
    parameters: undefined,
    customViewportWidth: undefined,
    selectedTabs: null,
    thresholds: [],
    includeLinks: true,
};

export const DEFAULT_VALUES_ALERT: SchedulerFormValues = {
    ...DEFAULT_VALUES,
    format: SchedulerFormat.IMAGE,
    cron: '0 10 * * *',
    thresholds: [
        {
            fieldId: '',
            operator: ThresholdOperator.GREATER_THAN,
            value: 0,
        },
    ],
    notificationFrequency: NotificationFrequency.ONCE,
};

export const getSelectedTabsForDashboardScheduler = (
    schedulerData: SchedulerAndTargets,
    isDashboardTabsAvailable: boolean,
    dashboard: Dashboard | undefined,
) => {
    return (
        isDashboardScheduler(schedulerData) && {
            selectedTabs: isDashboardTabsAvailable
                ? intersection(
                      schedulerData.selectedTabs,
                      dashboard?.tabs.map((tab) => tab.uuid),
                  )
                : null, // remove tabs that have been deleted
        }
    );
};

export const getFormValuesFromScheduler = (
    schedulerData: SchedulerAndTargets,
): SchedulerFormValues => {
    const options = schedulerData.options;

    const formOptions = { ...DEFAULT_VALUES.options };

    if (isSchedulerCsvOptions(options)) {
        formOptions.formatted = options.formatted
            ? Values.FORMATTED
            : Values.RAW;
        formOptions.limit =
            options.limit === Limit.TABLE
                ? Limit.TABLE
                : options.limit === Limit.ALL
                ? Limit.ALL
                : Limit.CUSTOM;
        if (formOptions.limit === Limit.CUSTOM) {
            formOptions.customLimit = options.limit as number;
        }
        formOptions.asAttachment = options.asAttachment || false;
    } else if (isSchedulerImageOptions(options)) {
        formOptions.withPdf = options.withPdf || false;
    }

    const emailTargets: string[] = [];
    const slackTargets: string[] = [];
    const msTeamsTargets: string[] = [];

    schedulerData.targets.forEach((target) => {
        if (isSlackTarget(target)) {
            slackTargets.push(target.channel);
        } else if (isCreateSchedulerMsTeamsTarget(target)) {
            msTeamsTargets.push(target.webhook);
        } else {
            emailTargets.push(target.recipient);
        }
    });

    return {
        name: schedulerData.name,
        message: schedulerData.message,
        format: schedulerData.format,
        cron: schedulerData.cron,
        timezone: schedulerData.timezone,
        options: formOptions,
        emailTargets: emailTargets,
        slackTargets: slackTargets,
        msTeamsTargets: msTeamsTargets,
        ...(isDashboardScheduler(schedulerData) && {
            filters: schedulerData.filters,
            parameters: schedulerData.parameters,
            customViewportWidth: schedulerData.customViewportWidth,
            selectedTabs: schedulerData.selectedTabs,
        }),
        thresholds: schedulerData.thresholds,
        notificationFrequency: schedulerData.notificationFrequency,
        includeLinks: schedulerData.includeLinks !== false,
    };
};

export const transformFormValues = (
    values: SchedulerFormValues,
    resourceType: 'chart' | 'dashboard' | undefined,
): CreateSchedulerAndTargetsWithoutIds => {
    let options = {};
    if ([SchedulerFormat.CSV, SchedulerFormat.XLSX].includes(values.format)) {
        options = {
            formatted: values.options.formatted === Values.FORMATTED,
            limit:
                values.options.limit === Limit.CUSTOM
                    ? values.options.customLimit
                    : values.options.limit,
            // Only allow attachment for CSV format and if there are email targets
            asAttachment:
                values.format === SchedulerFormat.CSV &&
                (values.emailTargets?.length || 0) > 0
                    ? values.options.asAttachment
                    : false,
        } satisfies SchedulerCsvOptions;
    } else if (values.format === SchedulerFormat.IMAGE) {
        options = {
            withPdf: values.options.withPdf,
        } satisfies SchedulerImageOptions;
    }

    const emailTargets = (values.emailTargets || []).map((email: string) => ({
        recipient: email,
    }));

    const slackTargets = (values.slackTargets || []).map(
        (channelId: string) => ({
            channel: channelId,
        }),
    );
    const msTeamsTargets = (values.msTeamsTargets || []).map(
        (webhook: string) => ({
            webhook: webhook,
        }),
    );

    const targets: CreateSchedulerTarget[] = [
        ...emailTargets,
        ...slackTargets,
        ...msTeamsTargets,
    ];

    return {
        name: values.name,
        message: values.message,
        format: values.format,
        cron: values.cron,
        timezone: values.timezone || undefined,
        options,
        targets,
        ...(resourceType === 'dashboard' && {
            filters: values.filters,
            parameters: values.parameters,
            customViewportWidth: values.customViewportWidth,
            selectedTabs: values.selectedTabs,
        }),
        thresholds: values.thresholds,
        enabled: true,
        notificationFrequency:
            'notificationFrequency' in values
                ? (values.notificationFrequency as NotificationFrequency)
                : undefined,
        includeLinks: values.includeLinks !== false,
    };
};
