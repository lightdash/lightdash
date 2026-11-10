import { useLayoutEffect, useState } from 'react';
import { OVERLAY_ATTRIBUTE } from './tileSelector';

const KEY_SEPARATOR = '|';
const SIBLINGS_SELECTOR = `:scope > :not([${OVERLAY_ATTRIBUTE}])`;

// Resolves one element per key, and keeps resolving while the DOM changes so
// elements mounted late (lazy tiles, tab switches) are picked up.
// With lockSiblings, everything else in a target is inert while it is one:
// the caller must portal an overlay into every target it gets.
export const usePortalTargets = (
    keys: string[],
    getSelector: (key: string) => string,
    enabled: boolean,
    lockSiblings: boolean,
): Record<string, Element> => {
    const [targets, setTargets] = useState<Record<string, Element>>({});
    const joinedKeys = keys.join(KEY_SEPARATOR);

    useLayoutEffect(() => {
        if (!enabled) {
            setTargets((prev) => (Object.keys(prev).length === 0 ? prev : {}));
            return;
        }
        const currentKeys =
            joinedKeys === '' ? [] : joinedKeys.split(KEY_SEPARATOR);

        // Only what this effect made inert, so cleanup undoes exactly that
        const locked = new Set<Element>();
        const lock = (targets: Element[]) => {
            const wanted = new Set(
                targets.flatMap((target) => [
                    ...target.querySelectorAll(SIBLINGS_SELECTOR),
                ]),
            );
            locked.forEach((element) => {
                if (wanted.has(element)) return;
                element.removeAttribute('inert');
                locked.delete(element);
            });
            wanted.forEach((element) => {
                if (element.hasAttribute('inert')) return;
                element.setAttribute('inert', '');
                locked.add(element);
            });
        };

        const resolve = () => {
            const next = currentKeys.reduce<Record<string, Element>>(
                (acc, key) => {
                    const element = document.querySelector(getSelector(key));
                    return element ? { ...acc, [key]: element } : acc;
                },
                {},
            );
            if (lockSiblings) lock(Object.values(next));
            setTargets((prev) => {
                const nextKeys = Object.keys(next);
                const isSame =
                    nextKeys.length === Object.keys(prev).length &&
                    nextKeys.every((key) => prev[key] === next[key]);
                return isSame ? prev : next;
            });
        };

        resolve();

        let frame: number | null = null;
        const observer = new MutationObserver(() => {
            if (frame !== null) return;
            frame = requestAnimationFrame(() => {
                frame = null;
                resolve();
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });

        return () => {
            observer.disconnect();
            if (frame !== null) cancelAnimationFrame(frame);
            lock([]);
        };
        // getSelector is expected to be a stable module-level function
    }, [joinedKeys, enabled, getSelector, lockSiblings]);

    return targets;
};
