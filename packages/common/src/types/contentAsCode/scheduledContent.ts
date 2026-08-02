import type { DashboardFilterRule } from '../filter';
import type { ParametersValuesMap } from '../parameters';
import type { PromotionAction } from '../promotion';
import type {
    NotificationFrequency,
    SchedulerCsvOptions,
    SchedulerFormat,
    SchedulerImageOptions,
    SchedulerPdfOptions,
    ThresholdOptions,
} from '../scheduler';
import type { ContentAsCodeType, FiltersInput } from './core';

export type ScheduledDeliveryTargetAsCode =
    | {
          type: 'email';
          recipient: string;
      }
    | {
          type: 'slack';
          channel: string;
      };

export type ScheduledDeliveryFormatAsCode =
    | {
          format: SchedulerFormat.CSV | SchedulerFormat.XLSX;
          options: SchedulerCsvOptions;
      }
    | {
          format: SchedulerFormat.IMAGE;
          options: SchedulerImageOptions;
      }
    | {
          format: SchedulerFormat.PDF;
          options: SchedulerPdfOptions;
      };

type ScheduledDeliveryAsCodeBase = {
    contentType: ContentAsCodeType.SCHEDULED_DELIVERY;
    version: number;
    slug: string;
    name: string;
    message: string | null;
    cron: string;
    timezone: string | null;
    enabled: boolean;
    includeLinks: boolean;
    targets: ScheduledDeliveryTargetAsCode[];
    downloadedAt?: Date;
};

export type ChartScheduledDeliveryAsCode = ScheduledDeliveryFormatAsCode &
    ScheduledDeliveryAsCodeBase & {
        resource: {
            type: 'chart';
            slug: string;
        };
        filters: FiltersInput | null;
        parameters: ParametersValuesMap | null;
        customViewportWidth: null;
        selectedTabs: null;
    };

export type DashboardScheduledDeliveryAsCode = ScheduledDeliveryFormatAsCode &
    ScheduledDeliveryAsCodeBase & {
        resource: {
            type: 'dashboard';
            slug: string;
        };
        filters: Omit<DashboardFilterRule, 'id'>[] | null;
        parameters: ParametersValuesMap | null;
        customViewportWidth: number | null;
        /** Portable dashboard-tab slugs, resolved to UUIDs on upload. */
        selectedTabs: string[] | null;
    };

export type ScheduledDeliveryAsCode =
    | ChartScheduledDeliveryAsCode
    | DashboardScheduledDeliveryAsCode;

export type ScheduledDeliveryAsCodeSkip = {
    name: string;
    reason: string;
};

export type ApiScheduledDeliveryAsCodeListResponse = {
    status: 'ok';
    results: {
        scheduledDeliveries: ScheduledDeliveryAsCode[];
        skipped: ScheduledDeliveryAsCodeSkip[];
    };
};

export type ApiScheduledDeliveryAsCodeUpsertResponse = {
    status: 'ok';
    results: {
        action:
            | PromotionAction.CREATE
            | PromotionAction.UPDATE
            | PromotionAction.NO_CHANGES;
    };
};

export type AlertAsCode = {
    contentType: ContentAsCodeType.ALERT;
    version: number;
    slug: string;
    name: string;
    message: string | null;
    cron: string;
    timezone: string | null;
    enabled: boolean;
    includeLinks: boolean;
    targets: ScheduledDeliveryTargetAsCode[];
    resource: {
        type: 'chart';
        slug: string;
    };
    thresholds: ThresholdOptions[];
    notificationFrequency: NotificationFrequency;
    filters: FiltersInput | null;
    parameters: ParametersValuesMap | null;
    downloadedAt?: Date;
};

export type ApiAlertAsCodeListResponse = {
    status: 'ok';
    results: {
        alerts: AlertAsCode[];
        skipped: ScheduledDeliveryAsCodeSkip[];
    };
};

export type ApiAlertAsCodeUpsertResponse = {
    status: 'ok';
    results: {
        action:
            | PromotionAction.CREATE
            | PromotionAction.UPDATE
            | PromotionAction.NO_CHANGES;
    };
};

type GoogleSheetsSyncAsCodeBase = {
    contentType: ContentAsCodeType.GOOGLE_SHEETS_SYNC;
    version: number;
    slug: string;
    name: string;
    message: string | null;
    cron: string;
    timezone: string | null;
    enabled: boolean;
    includeLinks: boolean;
    destination: {
        spreadsheetId: string;
        spreadsheetName: string;
        organizationName: string;
        url: string;
        tabName: string | null;
    };
    downloadedAt?: Date;
};

export type ChartGoogleSheetsSyncAsCode = GoogleSheetsSyncAsCodeBase & {
    resource: {
        type: 'chart';
        slug: string;
    };
    filters: FiltersInput | null;
    parameters: ParametersValuesMap | null;
    customViewportWidth: null;
    selectedTabs: null;
};

export type DashboardGoogleSheetsSyncAsCode = GoogleSheetsSyncAsCodeBase & {
    resource: {
        type: 'dashboard';
        slug: string;
    };
    filters: Omit<DashboardFilterRule, 'id'>[] | null;
    parameters: ParametersValuesMap | null;
    customViewportWidth: number | null;
    selectedTabs: string[] | null;
};

export type GoogleSheetsSyncAsCode =
    | ChartGoogleSheetsSyncAsCode
    | DashboardGoogleSheetsSyncAsCode;

export type ApiGoogleSheetsSyncAsCodeListResponse = {
    status: 'ok';
    results: {
        googleSheetsSyncs: GoogleSheetsSyncAsCode[];
        skipped: ScheduledDeliveryAsCodeSkip[];
    };
};

export type ApiGoogleSheetsSyncAsCodeUpsertResponse = {
    status: 'ok';
    results: {
        action:
            | PromotionAction.CREATE
            | PromotionAction.UPDATE
            | PromotionAction.NO_CHANGES;
    };
};
