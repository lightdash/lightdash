import { useCallback, useEffect, useRef, useState } from 'react';
import {
    elementRefKey,
    parseElementRefLabel,
    type ElementRef,
} from '../utils/elementRefs';
import type { ElementSelectedEvent } from './useAppSdkBridge';

/** Picker state and bridge callbacks to spread onto `AppIframePreview`. */
export type ElementPickerIframeProps = {
    inspectorEnabled: boolean;
    onElementSelected: (event: ElementSelectedEvent) => void;
    onInspectorAvailabilityChange: (available: boolean) => void;
    onInspectorCancelled: () => void;
};

export type UseElementPickerResult = {
    /** Picker mode is on: clicks in the preview produce element references. */
    enabled: boolean;
    /** The served bundle's SDK announced the picker; older SDKs never do. */
    available: boolean;
    refs: ElementRef[];
    toggle: () => void;
    select: (event: ElementSelectedEvent) => void;
    remove: (ref: ElementRef) => void;
    /** Leave picker mode (Esc); keeps the references picked so far. */
    cancel: () => void;
    /** Drop every picked reference; picker mode is untouched. */
    clear: () => void;
    iframeProps: ElementPickerIframeProps;
};

/**
 * Element picker wiring for an app preview host. A change of `identityKey`
 * (the same value passed as `AppIframePreview`'s) leaves picker mode and
 * forgets availability until the new bundle announces it.
 */
export const useElementPicker = ({
    identityKey,
    onEnabled,
    onPick,
}: {
    identityKey: string;
    /** The picker was turned on; hosts use it to leave lineage mode. */
    onEnabled?: () => void;
    /** Receives each picked reference instead of the hook keeping `refs`. */
    onPick?: (ref: ElementRef) => void;
}): UseElementPickerResult => {
    const [enabled, setEnabled] = useState(false);
    const [available, setAvailable] = useState(false);
    const [refs, setRefs] = useState<ElementRef[]>([]);

    const onEnabledRef = useRef(onEnabled);
    onEnabledRef.current = onEnabled;
    const onPickRef = useRef(onPick);
    onPickRef.current = onPick;

    const previousIdentityKeyRef = useRef(identityKey);
    useEffect(() => {
        if (previousIdentityKeyRef.current === identityKey) return;
        previousIdentityKeyRef.current = identityKey;
        setEnabled(false);
        setAvailable(false);
    }, [identityKey]);

    const toggle = useCallback(() => {
        const next = !enabled;
        setEnabled(next);
        if (next) onEnabledRef.current?.();
    }, [enabled]);

    const select = useCallback((event: ElementSelectedEvent) => {
        const ref = parseElementRefLabel(event.label);
        if (!ref) {
            console.warn(
                '[apps] Ignoring unrecognised element picker label:',
                event.label,
            );
            return;
        }
        if (onPickRef.current) {
            onPickRef.current(ref);
            return;
        }
        setRefs((prev) =>
            prev.some((r) => elementRefKey(r) === elementRefKey(ref))
                ? prev
                : [...prev, ref],
        );
    }, []);

    const remove = useCallback((ref: ElementRef) => {
        setRefs((prev) =>
            prev.filter((r) => elementRefKey(r) !== elementRefKey(ref)),
        );
    }, []);

    // Stable: `AppIframePreview` re-attaches its Esc listener when it changes.
    const cancel = useCallback(() => setEnabled(false), []);
    const clear = useCallback(() => setRefs([]), []);

    return {
        enabled,
        available,
        refs,
        toggle,
        select,
        remove,
        cancel,
        clear,
        iframeProps: {
            inspectorEnabled: enabled,
            onElementSelected: select,
            onInspectorAvailabilityChange: setAvailable,
            onInspectorCancelled: cancel,
        },
    };
};
