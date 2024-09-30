import { useEffect, useMemo, useRef, useState } from 'react';

type ObserverRect = Omit<DOMRectReadOnly, 'toJSON'>;

const defaultState: ObserverRect = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
};

/**
 * Implementation taken from: https://github.com/mantinedev/mantine/blob/master/src/mantine-hooks/src/use-resize-observer/use-resize-observer.ts
 * But dependencies of useMemo and useEffect react to changes to ref - which is crucial for this hook's usage
 */
export const useResizeObserver = <T extends HTMLElement = any>() => {
    const frameID = useRef(0);
    const [ref, setState] = useState<T | null>(null);

    const [rect, setRect] = useState<ObserverRect>(defaultState);

    const observer = useMemo(
        () =>
            typeof window !== 'undefined'
                ? new ResizeObserver((entries: any) => {
                      if (!Array.isArray(entries) || !entries.length) {
                          return;
                      }

                      const entry = entries[0];

                      cancelAnimationFrame(frameID.current);

                      frameID.current = requestAnimationFrame(() => {
                          if (ref) {
                              setRect(entry.contentRect);
                          }
                      });
                  })
                : null,
        [ref],
    );

    useEffect(() => {
        if (ref) {
            observer?.observe(ref);
        }

        return () => {
            observer?.disconnect();

            if (frameID.current) {
                cancelAnimationFrame(frameID.current);
            }
        };
    }, [ref, observer]);

    return [setState, rect] as const;
};
