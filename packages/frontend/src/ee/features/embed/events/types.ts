/**
 * Enum of all supported Lightdash embed event types
 */
export enum LightdashEventType {
    LocationChanged = 'locationChanged',
    FilterChanged = 'filterChanged',
    TabChanged = 'tabChanged',
    Error = 'error',
    AllTilesLoaded = 'allTilesLoaded',
    ChartSaved = 'chartSaved',
    DashboardSaved = 'dashboardSaved',
    Notification = 'notification',
}

/**
 * Payload for FilterChanged events.
 * Sanitized to exclude actual filter values and sensitive data.
 */
export type FilterChangedPayload = {
    /** Whether any filters are currently active */
    hasFilters: boolean;
    /** Total number of active filters */
    filterCount: number;
};

/**
 * Payload for TabChanged events.
 * Contains minimal information about tab navigation.
 */
export type TabChangedPayload = {
    /** Index of the newly active tab */
    tabIndex: number;
};

/**
 * Payload for Error events.
 * Sanitized to exclude stack traces and sensitive error details.
 */
export type ErrorPayload = {
    /** High-level error type classification */
    errorType: string;
};

/**
 * Payload for AllTilesLoaded events.
 * Indicates when dashboard has finished loading all tiles.
 */
export type AllTilesLoadedPayload = {
    /** Total number of tiles that were loaded */
    tilesCount: number;
    /** Time taken to load all tiles in milliseconds */
    loadTimeMs: number;
};

export type LocationChangedPayload = {
    pathname: string;
    search: string;
    href: string;
};

/**
 * Payload for ChartSaved events.
 * Contains the saved chart identifier and whether it was created or updated.
 */
export type ChartSavedAction = 'created' | 'updated';

export type ChartSavedPayload = {
    chartUuid: string;
    action: ChartSavedAction;
};

/**
 * Payload for DashboardSaved events.
 * Sent after the user saves changes to an embedded dashboard.
 */
export type DashboardSavedPayload = {
    dashboardUuid: string;
};

/**
 * Payload for Notification events.
 * SDK embeds don't render toasts, so they are sent to the host instead.
 * Notifications sharing an id update the same toast (e.g. loading → success).
 */
export type NotificationPayload = {
    id: string;
    variant: 'success' | 'error' | 'info' | 'warning';
    title: string | null;
    // Markdown when sent as a toast subtitle
    message: string | null;
};

export type LightdashEventPayload =
    | FilterChangedPayload
    | TabChangedPayload
    | ErrorPayload
    | AllTilesLoadedPayload
    | LocationChangedPayload
    | ChartSavedPayload
    | DashboardSavedPayload
    | NotificationPayload;

/**
 * Generic event structure for all Lightdash events
 */
export type LightdashEmbedEvent<T extends LightdashEventPayload | undefined> = {
    /** Namespaced event type (e.g., 'lightdash:filterChanged') */
    type: string;
    /** Event-specific payload data */
    payload?: T;
    /** Timestamp of event dispatch */
    timestamp: number;
};

type LightdashEventPayloads = {
    [LightdashEventType.LocationChanged]: LocationChangedPayload;
    [LightdashEventType.FilterChanged]: FilterChangedPayload;
    [LightdashEventType.TabChanged]: TabChangedPayload;
    [LightdashEventType.Error]: ErrorPayload;
    [LightdashEventType.AllTilesLoaded]: AllTilesLoadedPayload;
    [LightdashEventType.ChartSaved]: ChartSavedPayload;
    [LightdashEventType.DashboardSaved]: DashboardSavedPayload;
    [LightdashEventType.Notification]: NotificationPayload;
};

export type LightdashEventPayloadFor<K extends LightdashEventType> =
    LightdashEventPayloads[K];

/**
 * Event delivered to an SDK host's onEvent callback.
 * Same types and payloads as the iframe postMessage events.
 */
export type LightdashEvent = {
    [K in LightdashEventType]: {
        type: `${K}`;
        payload: LightdashEventPayloads[K];
    };
}[LightdashEventType];

export type LightdashEventHandler = (event: LightdashEvent) => void;

export type DispatchEmbedEvent = <K extends LightdashEventType>(
    eventType: K,
    payload: LightdashEventPayloadFor<K>,
) => boolean;
