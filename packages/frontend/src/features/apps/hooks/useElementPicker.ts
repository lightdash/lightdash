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
    enabled: enabledProp,
    onEnabledChange,
    onEnabled,
    onPick,
    maxRefs,
    refsIdentityKey,
}: {
    identityKey: string;
    enabled?: boolean;
    onEnabledChange?: (enabled: boolean) => void;
    /** The picker was turned on; hosts use it to leave lineage mode. */
    onEnabled?: () => void;
    /** Receives each picked reference instead of the hook keeping `refs`. */
    onPick?: (ref: ElementRef) => void;
    /** Optional cap for compact composers. */
    maxRefs?: number;
    /** Clear references when this resource changes, while `identityKey`
     * continues to reset iframe capability for each bundle version. */
    refsIdentityKey?: string;
}): UseElementPickerResult => {
    const [uncontrolledEnabled, setUncontrolledEnabled] = useState(false);
    const enabled = enabledProp ?? uncontrolledEnabled;
    const [available, setAvailable] = useState(false);
    const [refs, setRefs] = useState<ElementRef[]>([]);

    const onEnabledChangeRef = useRef(onEnabledChange);
    onEnabledChangeRef.current = onEnabledChange;
    // Stable setter: hosts put `cancel` in effect deps, so a per-render
    // identity (as Mantine's useUncontrolled returns) loops them.
    const setEnabled = useCallback((next: boolean) => {
        setUncontrolledEnabled(next);
        onEnabledChangeRef.current?.(next);
    }, []);

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
    }, [identityKey, setEnabled]);

    const previousRefsIdentityKeyRef = useRef(refsIdentityKey);
    useEffect(() => {
        if (previousRefsIdentityKeyRef.current === refsIdentityKey) return;
        previousRefsIdentityKeyRef.current = refsIdentityKey;
        if (refsIdentityKey !== undefined) setRefs([]);
    }, [refsIdentityKey]);

    const toggle = useCallback(() => {
        const next = !enabled;
        setEnabled(next);
        if (next) onEnabledRef.current?.();
    }, [enabled, setEnabled]);

    const select = useCallback(
        (event: ElementSelectedEvent) => {
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
                prev.some((r) => elementRefKey(r) === elementRefKey(ref)) ||
                (maxRefs !== undefined && prev.length >= maxRefs)
                    ? prev
                    : [...prev, ref],
            );
        },
        [maxRefs],
    );

    const remove = useCallback((ref: ElementRef) => {
        setRefs((prev) =>
            prev.filter((r) => elementRefKey(r) !== elementRefKey(ref)),
        );
    }, []);

    // Stable: `AppIframePreview` re-attaches its Esc listener when it changes.
    const cancel = useCallback(() => setEnabled(false), [setEnabled]);
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
