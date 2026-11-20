import { type AppSdkCaptureHold } from '@lightdash/common';
import { useCallback, useRef, type ReactNode } from 'react';
import { type ElementSelectedEvent } from '../../../features/apps/hooks/useAppSdkBridge';
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
    /** A Cursor hold is picking: the preview's element picker should be on. */
    picking: boolean;
    toggle: () => void;
    /** A hold key went down or came up inside the preview. */
    hold: (hold: AppSdkCaptureHold) => void;
    /** The preview's element picker reported a click. */
    elementSelected: (event: ElementSelectedEvent) => void;
    bundle: {
        chips: BundleChip[];
        waiting: boolean;
        sendAll: () => void;
        remove: (bubbleId: string) => void;
    };
    element: ReactNode;
} => {
    const { surface, elementSelected: selectInFrame } = useAppFrameSurface({
        projectUuid,
        getFrame,
        captureScreenshot,
    });

    // Set below, once the bundle that needs Design Mode's session exists.
    const addRef = useRef<(payload: DesignPayload) => DesignSendResult>(
        () => 'cancelled',
    );
    const onSend = useCallback(
        async (payload: DesignPayload) => addRef.current(payload),
        [],
    );
    const design = useDesignMode(surface, {
        onSend,
        renderBubbleBody: null,
        picker: null,
        cancelSend: noCancel,
    });
    const { on, setOn, session, close, framePick, frameHold } = design;

    const bundle = useDesignBundle({
        session,
        busy,
        attachedCount,
        attach,
        submit,
        close,
        onDropped,
    });
    addRef.current = bundle.add;

    const toggle = useCallback(() => setOn(!on), [on, setOn]);
    const hold = useCallback(
        ({ tool, phase }: AppSdkCaptureHold) => frameHold(tool, phase),
        [frameHold],
    );
    const elementSelected = useCallback(
        (event: ElementSelectedEvent) => selectInFrame(event, framePick),
        [framePick, selectInFrame],
    );

    return {
        available: surface !== null,
        on,
        picking: on && design.holding === 'cursor',
        toggle,
        hold,
        elementSelected,
        bundle: {
            chips: bundle.chips,
            waiting: bundle.waiting,
            sendAll: bundle.sendAll,
            remove: bundle.remove,
        },
        element: design.element,
    };
};
