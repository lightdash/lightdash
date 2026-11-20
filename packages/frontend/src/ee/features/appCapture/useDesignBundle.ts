import { MAX_APP_FILES_PER_VERSION } from '@lightdash/common';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    bundleChipLabel,
    bundleDesignBubbles,
    bundleImageName,
} from '../../../features/apps/utils/bundleDesignBubbles';
import { imagesThatFit } from '../../../features/apps/utils/captureAttachments';
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
    busy,
    attachedCount,
    attach,
    submit,
    close,
    onDropped,
}: {
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
    /** A bubble was closed on the page: it leaves the bundle with it. */
    drop: (bubbleId: string) => void;
} => {
    const [entries, setEntries] = useState<Entry[]>([]);
    const [waiting, setWaiting] = useState(false);
    const sendingRef = useRef(false);
    const host = { attachedCount, attach, submit, close, onDropped };
    const hostRef = useRef(host);
    hostRef.current = host;

    // The bundle keeps its own entries: leaving Design Mode, or a preview
    // reload that resets the session, must not lose what is waiting to send.
    const bundledRef = useRef(entries);
    bundledRef.current = entries;

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

    const isEmpty = entries.length === 0;
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

    const drop = useCallback((bubbleId: string) => {
        setEntries((prev) =>
            prev.some((e) => e.bubbleId === bubbleId)
                ? prev.filter((e) => e.bubbleId !== bubbleId)
                : prev,
        );
    }, []);

    const remove = useCallback(
        (bubbleId: string) => {
            drop(bubbleId);
            hostRef.current.close(bubbleId);
        },
        [drop],
    );

    const chips = useMemo(
        () =>
            entries.map((entry, index) => ({
                bubbleId: entry.bubbleId,
                label: bundleChipLabel(
                    index + 1,
                    entry.markNumbers,
                    entry.words,
                ),
            })),
        [entries],
    );

    return { add, chips, waiting, sendAll, remove, drop };
};
