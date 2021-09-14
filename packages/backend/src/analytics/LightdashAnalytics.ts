/// <reference path="../@types/rudder-sdk-node.d.ts" />
import Analytics, {
    Track as AnalyticsTrack,
} from '@rudderstack/rudder-sdk-node';
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
type BaseTrack = Omit<AnalyticsTrack, 'context'>;
type Group = {
    userId: string;
    groupId: string;
    traits: {
        name?: string;
    };
};
type TrackSimpleEvent = BaseTrack & {
    event:
        | 'user.created'
        | 'user.logged_in'
        | 'user.updated'
        | 'password.updated'
        | 'invite_link.created'
        | 'invite_link.all_revoked'
        | 'query.executed';
};

type TrackOrganizationEvent = BaseTrack & {
    event: 'organization.created' | 'organization.updated';
    properties: {
        organizationUuid: string;
        organizationName: string;
    };
};

type TrackUserDeletedEvent = BaseTrack & {
    event: 'user.deleted';
    properties: {
        deletedUserUuid: string;
    };
};

type TrackSavedChart = BaseTrack & {
    event:
        | 'saved_chart.created'
        | 'saved_chart.updated'
        | 'saved_chart.deleted'
        | 'saved_chart_version.created';
    properties: {
        savedQueryId: string;
    };
};

type Track =
    | TrackSimpleEvent
    | TrackSavedChart
    | TrackUserDeletedEvent
    | TrackOrganizationEvent;

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
            event: `${LightdashAnalytics.lightdashContext.app.name}.${payload.event}`,
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
