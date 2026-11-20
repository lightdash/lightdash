import { type AppSdkCaptureHold } from '@lightdash/common';
import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
} from 'react';
import { type ElementSelectedEvent } from '../../../features/apps/hooks/useAppSdkBridge';
import { captureTranscriber } from '../../../features/apps/utils/transcribeCapture';
import useApp from '../../../providers/App/useApp';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import {
    type CaptureTarget,
    type DesignPayload,
    type DesignSendResult,
    type DesignSurface,
} from '../capture/types';
import { useBubbleConversations } from '../capture/useBubbleConversations';
import { useDesignMode } from '../capture/useDesignMode';

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

type Picked = { target: CaptureTarget; rect: DOMRect };

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
        const lightdashApi = useLightdashApi();
        const { health } = useApp();
        const conversations = useBubbleConversations(projectUuid);
        const { send: sendMessage } = conversations;

        // Read through refs so the surface keeps a stable identity.
        const getFrameRef = useRef(getFrame);
        getFrameRef.current = getFrame;
        // The element the app reported, only while its pick is being made.
        const pickedRef = useRef<Picked | null>(null);

        const voiceTranscriptionAvailable =
            health.data?.ai.voiceTranscriptionAvailable;
        // No picture from the app, no Design Mode: marks need something to sit on.
        const surface = useMemo<DesignSurface | null>(
            () =>
                captureScreenshot
                    ? {
                          getRegion: () =>
                              getFrameRef.current()?.getBoundingClientRect() ??
                              new DOMRect(),
                          // The app does not say how far it has scrolled.
                          getScroll: () => ({ x: 0, y: 0 }),
                          frameSource: 'app',
                          grabAppImage: captureScreenshot,
                          // Tabs inside an app cannot be seen from outside it.
                          getTab: () => null,
                          resolveTarget: null,
                          pickAt: () => pickedRef.current,
                          transcribe: captureTranscriber(
                              lightdashApi,
                              projectUuid,
                              voiceTranscriptionAvailable,
                          ),
                      }
                    : null,
            [
                captureScreenshot,
                lightdashApi,
                projectUuid,
                voiceTranscriptionAvailable,
            ],
        );

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
                elementSelected: ({ label, rect }) => {
                    const frame = getFrameRef
                        .current()
                        ?.getBoundingClientRect();
                    if (!frame) return;
                    // The app's pixels start at its frame's top left corner.
                    const onPage = rect
                        ? new DOMRect(
                              frame.left + rect.x,
                              frame.top + rect.y,
                              rect.width,
                              rect.height,
                          )
                        : // An older bundle does not say where the element is.
                          new DOMRect(frame.right, frame.top, 0, 0);
                    pickedRef.current = {
                        target: { kind: 'element', id: label, label },
                        rect: onPage,
                    };
                    framePick({
                        x: onPage.x + onPage.width / 2,
                        y: onPage.y + onPage.height / 2,
                    });
                    pickedRef.current = null;
                },
            }),
            [frameHold, framePick, on, setOn],
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
