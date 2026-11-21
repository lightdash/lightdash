import { type AppSdkCaptureHold } from '@lightdash/common';
import { forwardRef, useCallback, useEffect, useImperativeHandle } from 'react';
import { type InspectedElement } from '../../../features/apps/hooks/useIframeInspectAt';
import { type DesignPayload, type DesignSendResult } from '../capture/types';
import { useBubbleConversations } from '../capture/useBubbleConversations';
import { useDesignMode } from '../capture/useDesignMode';
import { useAppFrameSurface } from './useAppFrameSurface';

export type AppViewDesignModeHandle = {
    toggle: () => void;
    /** The hold key went down or came up inside the app. */
    hold: (hold: AppSdkCaptureHold) => void;
};

type Props = {
    projectUuid: string;
    /** The app to attach to each message, or null to attach none. */
    attachedAppUuid: string | null;
    appName: string;
    /** The app's frame: the part of the page that can be marked. */
    getFrame: () => HTMLElement | null;
    /** The app's own picture of itself. Null when its bundle cannot take one. */
    captureScreenshot: (() => Promise<Blob>) | null;
    /** Asks the app what element is at a point in its own pixels. */
    inspectAt: (point: {
        x: number;
        y: number;
    }) => Promise<InspectedElement | null>;
    onStateChange: (on: boolean) => void;
};

/** Design Mode on a published app: mark it, say what to change, read the reply there. */
const AppViewDesignMode = forwardRef<AppViewDesignModeHandle, Props>(
    (
        {
            projectUuid,
            attachedAppUuid,
            appName,
            getFrame,
            captureScreenshot,
            inspectAt,
            onStateChange,
        },
        ref,
    ) => {
        const conversations = useBubbleConversations(projectUuid);
        const { send: sendMessage } = conversations;
        const { surface } = useAppFrameSurface({
            projectUuid,
            getFrame,
            captureScreenshot,
            inspectAt,
        });

        const onSend = useCallback(
            (payload: DesignPayload): Promise<DesignSendResult> =>
                sendMessage(payload, {
                    heading: `These requests are about the data app "${appName}".`,
                    about: [],
                    marked: attachedAppUuid
                        ? [{ type: 'data_app', appUuid: attachedAppUuid }]
                        : [],
                }),
            [appName, attachedAppUuid, sendMessage],
        );

        const design = useDesignMode(surface, {
            onSend,
            renderBubbleBody: (bubble, session) =>
                conversations.renderBody(bubble, session, null),
            picker: conversations.picker,
            cancelSend: conversations.cancelSend,
            onBubbleRemoved: null,
        });
        conversations.attach(design);

        const { on, setOn, frameHold } = design;
        useEffect(() => {
            onStateChange(on);
        }, [on, onStateChange]);

        useImperativeHandle(
            ref,
            () => ({
                toggle: () => setOn(!on),
                hold: ({ phase }) => frameHold(phase),
            }),
            [frameHold, on, setOn],
        );

        return (
            <>
                {design.element}
                {conversations.renderPosters(design.session)}
            </>
        );
    },
);

export default AppViewDesignMode;
