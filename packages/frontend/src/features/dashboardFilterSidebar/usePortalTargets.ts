import { useLayoutEffect, useState } from 'react';

const KEY_SEPARATOR = '|';

// Resolves one element per key, and keeps resolving while the DOM changes so
// elements mounted late (lazy tiles, tab switches) are picked up.
export const usePortalTargets = (
    keys: string[],
    getSelector: (key: string) => string,
    enabled: boolean,
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

        const resolve = () => {
            const next = currentKeys.reduce<Record<string, Element>>(
                (acc, key) => {
                    const element = document.querySelector(getSelector(key));
                    return element ? { ...acc, [key]: element } : acc;
                },
                {},
            );
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
        };
        // getSelector is expected to be a stable module-level function
    }, [joinedKeys, enabled, getSelector]);

    return targets;
};
