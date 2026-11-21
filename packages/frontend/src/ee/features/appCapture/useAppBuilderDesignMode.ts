import { type AppSdkCaptureHold } from '@lightdash/common';
import { useCallback, useRef, type ReactNode } from 'react';
import { type InspectedElement } from '../../../features/apps/hooks/useIframeInspectAt';
import { type DesignPayload, type DesignSendResult } from '../capture/types';
import { useDesignMode } from '../capture/useDesignMode';
import { useAppFrameSurface } from './useAppFrameSurface';
import { useDesignBundle, type BundleChip } from './useDesignBundle';

const noCancel = () => {};

/**
 * Design Mode in the app builder: mark the preview and say what to change.
 * Bubbles do not send on their own; they wait in a bundle for the composer.
 */
export const useAppBuilderDesignMode = ({
    projectUuid,
    getFrame,
    captureScreenshot,
    inspectAt,
    busy,
    attachedCount,
    attach,
    submit,
    onDropped,
}: {
    projectUuid: string | null;
    /** The preview's frame: the part of the page that can be marked. */
    getFrame: () => HTMLElement | null;
    /** The preview's own picture of itself. Null turns Design Mode off. */
    captureScreenshot: (() => Promise<Blob>) | null;
    /** Asks the preview what element is at a point in its own pixels. */
    inspectAt: (point: {
        x: number;
        y: number;
    }) => Promise<InspectedElement | null>;
    /** The builder cannot take a prompt right now. */
    busy: boolean;
    /** Files already attached to the builder's next prompt. */
    attachedCount: number;
    attach: (image: File) => Promise<void>;
    submit: (prompt: string) => void;
    /** Some pictures did not fit in the prompt. */
    onDropped: (count: number) => void;
}): {
    /** False when the preview cannot be marked. */
    available: boolean;
    on: boolean;
    toggle: () => void;
    /** The hold key went down or came up inside the preview. */
    hold: (hold: AppSdkCaptureHold) => void;
    bundle: {
        chips: BundleChip[];
        waiting: boolean;
        sendAll: () => void;
        remove: (bubbleId: string) => void;
    };
    element: ReactNode;
} => {
    const { surface } = useAppFrameSurface({
        projectUuid,
        getFrame,
        captureScreenshot,
        inspectAt,
    });

    // Set below, once Design Mode exists: the bundle takes bubbles off the page.
    const closeRef = useRef<(bubbleId: string) => void>(noCancel);
    const close = useCallback(
        (bubbleId: string) => closeRef.current(bubbleId),
        [],
    );
    const bundle = useDesignBundle({
        busy,
        attachedCount,
        attach,
        submit,
        close,
        onDropped,
    });
    const { add, drop } = bundle;
    const onSend = useCallback(
        async (payload: DesignPayload): Promise<DesignSendResult> =>
            add(payload),
        [add],
    );
    // The bundle outlives the session: leaving Design Mode keeps what is bundled.
    const design = useDesignMode(surface, {
        onSend,
        renderBubbleBody: null,
        picker: null,
        cancelSend: noCancel,
        onBubbleRemoved: drop,
    });
    const { on, setOn, frameHold } = design;
    closeRef.current = design.close;

    const toggle = useCallback(() => setOn(!on), [on, setOn]);
    const hold = useCallback(
        ({ phase }: AppSdkCaptureHold) => frameHold(phase),
        [frameHold],
    );

    return {
        available: surface !== null,
        on,
        toggle,
        hold,
        bundle: {
            chips: bundle.chips,
            waiting: bundle.waiting,
            sendAll: bundle.sendAll,
            remove: bundle.remove,
        },
        element: design.element,
    };
};
