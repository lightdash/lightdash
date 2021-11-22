import { Colors } from '@blueprintjs/core';
import { ChatWidget as PapercupsChatWidget } from '@papercups-io/chat-widget';
import React from 'react';
import { useApp } from '../providers/AppProvider';
import { useTracking } from '../providers/TrackingProvider';

export const ChatWidget = () => {
    const app = useApp();
    const tracking = useTracking();

    if (app.health.data?.papercups?.token) {
        return (
            <PapercupsChatWidget
                token={app.health.data.papercups.token}
                title="Ask us anything"
                subtitle=""
                primaryColor={Colors.BLUE1}
                greeting="Enjoying the demo? Try Lightdash for free. Request access for Lightdash Cloud and we'll be in touch."
                newMessagePlaceholder="Start typing..."
                showAgentAvailability={false}
                requireEmailUpfront
                iconVariant="filled"
                customer={{
                    external_id: tracking.data?.rudder?.getAnonymousId(),
                }}
                popUpInitialMessage={10000}
            />
        );
    }
    return null;
};
