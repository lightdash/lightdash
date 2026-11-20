import { MAX_APP_FILES_PER_VERSION } from '@lightdash/common';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    bundleChipLabel,
    bundleDesignBubbles,
    bundleImageName,
} from '../../../features/apps/utils/bundleDesignBubbles';
import { imagesThatFit } from '../../../features/apps/utils/captureAttachments';
import { type DesignSession } from '../capture/designSession';
import { type DesignPayload } from '../capture/types';

type Entry = {
    bubbleId: string;
    summary: string;
    typed: string;
    images: File[];
    markNumbers: number[];
    /** What was typed or said, for the chip. */
    words: string;
};

export type BundleChip = { bubbleId: string; label: string };

/**
 * The app builder's bundle of Design Mode bubbles. The builder takes one prompt
 * at a time, so bubbles wait here and go out together.
 */
export const useDesignBundle = ({
    session,
    busy,
    attachedCount,
    attach,
    submit,
    close,
    onDropped,
}: {
    session: DesignSession;
    /** The builder cannot take a prompt right now. */
    busy: boolean;
    /** Files already attached to the builder's next prompt. */
    attachedCount: number;
    attach: (image: File) => Promise<void>;
    submit: (prompt: string) => void;
    /** Takes a bubble off the page. */
    close: (bubbleId: string) => void;
    /** Some pictures did not fit in the prompt. */
    onDropped: (count: number) => void;
}): {
    /** Design Mode's onSend: the bubble joins the bundle. */
    add: (payload: DesignPayload) => 'queued';
    chips: BundleChip[];
    /** Send all was asked for while the builder was busy. */
    waiting: boolean;
    sendAll: () => void;
    remove: (bubbleId: string) => void;
} => {
    const [entries, setEntries] = useState<Entry[]>([]);
    const [waiting, setWaiting] = useState(false);
    const sendingRef = useRef(false);
    const host = { attachedCount, attach, submit, close, onDropped };
    const hostRef = useRef(host);
    hostRef.current = host;

    // A bubble closed on the page leaves the bundle with it.
    const bundled = useMemo(
        () =>
            entries.filter((entry) =>
                session.bubbles.some((b) => b.id === entry.bubbleId),
            ),
        [entries, session.bubbles],
    );
    const bundledRef = useRef(bundled);
    bundledRef.current = bundled;

    const add = useCallback((payload: DesignPayload): 'queued' => {
        const entry: Entry = {
            bubbleId: payload.bubbleId,
            summary: payload.summary,
            typed: payload.typed,
            images: payload.images,
            markNumbers: payload.marks.map((mark) => mark.number),
            words:
                payload.typed ||
                payload.transcript.map((phrase) => phrase.text).join(' '),
        };
        setEntries((prev) => [
            ...prev.filter((e) => e.bubbleId !== entry.bubbleId),
            entry,
        ]);
        return 'queued';
    }, []);

    const flush = useCallback(async () => {
        const list = bundledRef.current;
        if (list.length === 0 || sendingRef.current) return;
        sendingRef.current = true;
        try {
            const { attachedCount: attached, ...to } = hostRef.current;
            const named = list.map((entry, index) =>
                entry.images.map(
                    (image, i) =>
                        new File([image], bundleImageName(index + 1, i + 1), {
                            type: image.type,
                        }),
                ),
            );
            const { fit, dropped } = imagesThatFit(
                named.flat(),
                attached,
                MAX_APP_FILES_PER_VERSION,
            );
            await Promise.all(fit.map((image) => to.attach(image)));
            if (dropped > 0) to.onDropped(dropped);
            to.submit(
                bundleDesignBubbles(
                    list.map((entry, index) => ({
                        summary: entry.summary,
                        typed: entry.typed,
                        imageNames: named[index]
                            .filter((image) => fit.includes(image))
                            .map((image) => image.name),
                    })),
                ),
            );
            const sent = new Set(list.map((entry) => entry.bubbleId));
            setEntries((prev) => prev.filter((e) => !sent.has(e.bubbleId)));
            list.forEach((entry) => to.close(entry.bubbleId));
        } finally {
            sendingRef.current = false;
        }
    }, []);

    const isEmpty = bundled.length === 0;
    useEffect(() => {
        if (!waiting) return;
        if (isEmpty) {
            setWaiting(false);
            return;
        }
        if (busy) return;
        setWaiting(false);
        void flush();
    }, [busy, flush, isEmpty, waiting]);

    const sendAll = useCallback(() => {
        if (bundledRef.current.length > 0) setWaiting(true);
    }, []);

    const remove = useCallback((bubbleId: string) => {
        setEntries((prev) => prev.filter((e) => e.bubbleId !== bubbleId));
        hostRef.current.close(bubbleId);
    }, []);

    const chips = useMemo(
        () =>
            bundled.map((entry, index) => ({
                bubbleId: entry.bubbleId,
                label: bundleChipLabel(
                    index + 1,
                    entry.markNumbers,
                    entry.words,
                ),
            })),
        [bundled],
    );

    return { add, chips, waiting, sendAll, remove };
};
