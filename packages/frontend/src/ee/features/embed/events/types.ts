/**
 * Enum of all supported Lightdash embed event types
 */
export enum LightdashEventType {
    FilterChanged = 'filterChanged',
    TabChanged = 'tabChanged',
    Error = 'error',
    AllTilesLoaded = 'allTilesLoaded',
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
    /** Timestamp when the filter change occurred */
    timestamp: number;
};

/**
 * Payload for TabChanged events.
 * Contains minimal information about tab navigation.
 */
export type TabChangedPayload = {
    /** Index of the newly active tab */
    tabIndex: number;
    /** Timestamp when the tab change occurred */
    timestamp: number;
};

/**
 * Payload for Error events.
 * Sanitized to exclude stack traces and sensitive error details.
 */
export type ErrorPayload = {
    /** High-level error type classification */
    errorType: string;
    /** Timestamp when the error occurred */
    timestamp: number;
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
    /** Timestamp when all tiles finished loading */
    timestamp: number;
};

export type LightdashEventPayload =
    | FilterChangedPayload
    | TabChangedPayload
    | ErrorPayload
    | AllTilesLoadedPayload;

/**
 * Generic event structure for all Lightdash events
 */
export type LightdashEmbedEvent<T extends LightdashEventPayload> = {
    /** Namespaced event type (e.g., 'lightdash:filterChanged') */
    type: string;
    /** Event-specific payload data */
    payload: T;
    /** Timestamp of event dispatch */
    timestamp: number;
};
