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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        traits?: Record<string, any>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        context?: Record<string, any>;
    }
    interface Group {
        anonymousId?: string;
        userId?: string;
        groupId: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        traits?: Record<string, any>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        context?: Record<string, any>;
    }
    export interface Track {
        userId?: string;
        anonymousId?: string;
        event: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        properties?: Record<string, any>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        context?: Record<string, any>;
    }

    declare class Analytics {
        constructor(writeKey: string, options?: AnalyticsOptions);
        identify(payload: Identify): void;
        track(payload: Track): void;
        group(payload: Group): void;
    }

    export default Analytics;
}
