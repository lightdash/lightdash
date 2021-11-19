import { ChatWidget as PapercupsChatWidget } from '@papercups-io/chat-widget';
import React, { useEffect, useState } from 'react';
import { useApp } from '../providers/AppProvider';
import { useTracking } from '../providers/TrackingProvider';

export const ChatWidget = () => {
    const [isVisible, setIsVisible] = useState(false);
    const app = useApp();
    const tracking = useTracking();

    useEffect(() => {
        setTimeout(() => setIsVisible(true), 10000);
    }, []);
    if (app.health.data?.papercups?.token && isVisible) {
        return (
            <PapercupsChatWidget
                token={app.health.data.papercups.token}
                title="Ask us anything"
                subtitle=""
                primaryColor="#9900ef"
                greeting="Enjoying the demo? Request your own free instance with Lightdash Cloud. Message below to learn more."
                newMessagePlaceholder="Start typing..."
                showAgentAvailability={false}
                requireEmailUpfront={false}
                iconVariant="filled"
                customer={{
                    external_id: tracking.data?.rudder?.getAnonymousId(),
                }}
                defaultIsOpen
            />
        );
    }
    return null;
};
