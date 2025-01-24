declare module '@rudderstack/rudder-sdk-node' {
    import { AnyType } from '@lightdash/common';

    interface Options {
        flushAt?: number;
        flushInterval?: number;
        host?: string;
        enable?: boolean;
    }
    interface Identify {
        anonymousId?: string;
        userId?: string;
        traits?: Record<string, AnyType>;
        context?: Record<string, AnyType>;
    }
    interface Group {
        anonymousId?: string;
        userId?: string;
        groupId: string;
        traits?: Record<string, AnyType>;
        context?: Record<string, AnyType>;
    }
    export interface Track {
        userId?: string;
        anonymousId?: string;
        event: string;
        properties?: Record<string, AnyType>;
        context?: Record<string, AnyType>;
    }

    declare class Analytics {
        constructor(writeKey: string, options?: AnalyticsOptions);
        identify(payload: Identify): void;
        track(payload: Track): void;
        group(payload: Group): void;
    }

    export default Analytics;
}
