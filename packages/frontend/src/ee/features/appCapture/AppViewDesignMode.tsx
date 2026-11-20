import { type AppSdkCaptureHold } from '@lightdash/common';
import { forwardRef, useCallback, useEffect, useImperativeHandle } from 'react';
import { type ElementSelectedEvent } from '../../../features/apps/hooks/useAppSdkBridge';
import { type DesignPayload, type DesignSendResult } from '../capture/types';
import { useBubbleConversations } from '../capture/useBubbleConversations';
import { useDesignMode } from '../capture/useDesignMode';
import { useAppFrameSurface } from './useAppFrameSurface';

export type AppViewDesignModeHandle = {
    toggle: () => void;
    /** A hold key went down or came up inside the app. */
    hold: (hold: AppSdkCaptureHold) => void;
    /** The app's element picker reported a click. */
    elementSelected: (event: ElementSelectedEvent) => void;
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
    /** Whether Design Mode is on, and whether a Cursor hold is picking. */
    onStateChange: (on: boolean, picking: boolean) => void;
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
            onStateChange,
        },
        ref,
    ) => {
        const conversations = useBubbleConversations(projectUuid);
        const { send: sendMessage } = conversations;
        const { surface, elementSelected } = useAppFrameSurface({
            projectUuid,
            getFrame,
            captureScreenshot,
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
        });
        conversations.attach(design);

        const { on, setOn, framePick, frameHold } = design;
        const picking = on && design.holding === 'cursor';
        useEffect(() => {
            onStateChange(on, picking);
        }, [on, onStateChange, picking]);

        useImperativeHandle(
            ref,
            () => ({
                toggle: () => setOn(!on),
                hold: ({ tool, phase }) => frameHold(tool, phase),
                elementSelected: (event) => elementSelected(event, framePick),
            }),
            [elementSelected, frameHold, framePick, on, setOn],
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
