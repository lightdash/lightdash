declare module '@rudderstack/rudder-sdk-node' {
    interface Options {
        flushAt?: number;
        flushInterval?: number;
        host?: string;
        enable?: boolean;
    }
    interface Identify {
        anonymousId?: string;
        userId?: string;
        traits?: Record<string, unknown>;
        context?: Record<string, unknown>;
    }
    interface Group {
        anonymousId?: string;
        userId?: string;
        groupId: string;
        traits?: Record<string, unknown>;
        context?: Record<string, unknown>;
    }
    export interface Track {
        userId?: string;
        anonymousId?: string;
        event: string;
        properties?: Record<string, unknown>;
        context?: Record<string, unknown>;
    }

    declare class Analytics {
        constructor(
            writeKey: string,
            dataPlaneUrl: string,
            options?: AnalyticsOptions,
        );
        identify(payload: Identify): void;
        track(payload: Track): void;
        group(payload: Group): void;
        flush(callback: (err, batch) => void): void;
    }

    export default Analytics;
}
