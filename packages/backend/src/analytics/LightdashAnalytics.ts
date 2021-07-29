/// <reference path="../rudder-sdk-node.d.ts" />
import Analytics from '@rudderstack/rudder-sdk-node';
import { VERSION } from '../version';

type Identify = {
    userId: string;
    traits: {
        email?: string;
        first_name?: string;
        last_name?: string;
        is_tracking_anonymized: boolean;
    };
};
type BaseTrack = {
    userId: string;
    event: string;
};
type Group = {
    userId: string;
    groupId: string;
    traits: {
        name?: string;
    };
};
type TrackUserCreated = BaseTrack & {
    event: 'user_created';
};
type TrackOrganizationCreated = BaseTrack & {
    event: 'organization_created';
};
type TrackUserLoggedIn = BaseTrack & {
    event: 'user_logged_in';
};
type TrackUserUpdated = BaseTrack & {
    event: 'user_updated';
};
type TrackPasswordUpdated = BaseTrack & {
    event: 'password_updated';
};
type TrackOrganizationUpdated = BaseTrack & {
    event: 'organization_updated';
};
type Track =
    | TrackUserCreated
    | TrackOrganizationCreated
    | TrackUserLoggedIn
    | TrackUserUpdated
    | TrackPasswordUpdated
    | TrackOrganizationUpdated;

export class LightdashAnalytics extends Analytics {
    static lightdashContext = {
        app: {
            namespace: 'lightdash',
            name: 'lightdash_server',
            version: VERSION,
        },
    };

    identify(payload: Identify) {
        super.identify({
            ...payload,
            context: LightdashAnalytics.lightdashContext,
        });
    }

    track(payload: Track) {
        super.track({
            ...payload,
            context: LightdashAnalytics.lightdashContext,
        });
    }

    group(payload: Group) {
        super.group({
            ...payload,
            context: LightdashAnalytics.lightdashContext,
        });
    }
}
