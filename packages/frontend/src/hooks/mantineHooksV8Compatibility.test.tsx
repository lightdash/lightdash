import { useElementSize, useInterval, useTimeout } from '@mantine-8/hooks';
import { act, render, renderHook, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

const useControlledInterval = (enabled: boolean) => {
    const [ticks, setTicks] = useState(0);
    const interval = useInterval(() => setTicks((value) => value + 1), 1_000);

    useEffect(() => {
        if (enabled) {
            interval.start();
        } else {
            interval.stop();
        }

        return interval.stop;
        // Matches the controlled interval pattern used by JobDetailsDrawer.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled]);

    return ticks;
};

const useDelayedFlag = (pending: boolean) => {
    const [visible, setVisible] = useState(false);
    const { start, clear } = useTimeout(() => setVisible(true), 400);

    useEffect(() => {
        if (pending) {
            start();
        } else {
            clear();
            setVisible(false);
        }
    }, [pending, start, clear]);

    return visible;
};

const ElementSizeProbe = () => {
    const { ref, width, height } = useElementSize<HTMLDivElement>();

    return (
        <div ref={ref} data-testid="element-size">
            {width}x{height}
        </div>
    );
};

describe('Mantine v8 hooks compatibility', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    test('controlled intervals keep running across callback rerenders and stop when disabled', () => {
        vi.useFakeTimers();
        const { result, rerender } = renderHook(
            ({ enabled }) => useControlledInterval(enabled),
            { initialProps: { enabled: true } },
        );

        act(() => {
            vi.advanceTimersByTime(2_000);
        });
        expect(result.current).toBe(2);

        rerender({ enabled: false });
        act(() => {
            vi.advanceTimersByTime(2_000);
        });
        expect(result.current).toBe(2);
    });

    test('delayed state appears after its timeout and stays hidden when cancelled', () => {
        vi.useFakeTimers();
        const { result, rerender } = renderHook(
            ({ pending }) => useDelayedFlag(pending),
            { initialProps: { pending: true } },
        );

        act(() => {
            vi.advanceTimersByTime(399);
        });
        expect(result.current).toBe(false);

        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(result.current).toBe(true);

        rerender({ pending: false });
        rerender({ pending: true });
        act(() => {
            vi.advanceTimersByTime(200);
        });
        rerender({ pending: false });
        act(() => {
            vi.advanceTimersByTime(400);
        });
        expect(result.current).toBe(false);
    });

    test('element size updates after the first ResizeObserver measurement', () => {
        let resizeCallback: ResizeObserverCallback | undefined;
        const observer = {
            observe: vi.fn(),
            unobserve: vi.fn(),
            disconnect: vi.fn(),
        } as unknown as ResizeObserver;

        vi.stubGlobal(
            'ResizeObserver',
            class {
                constructor(callback: ResizeObserverCallback) {
                    resizeCallback = callback;
                }

                observe = observer.observe;

                unobserve = observer.unobserve;

                disconnect = observer.disconnect;
            },
        );
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
            (callback) => {
                callback(0);
                return 1;
            },
        );

        render(<ElementSizeProbe />);
        expect(screen.getByTestId('element-size')).toHaveTextContent('0x0');
        expect(observer.observe).toHaveBeenCalled();

        const contentRect = {
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            bottom: 480,
            right: 640,
            width: 640,
            height: 480,
        } as DOMRectReadOnly;
        const boxSize: ResizeObserverSize = {
            inlineSize: 640,
            blockSize: 480,
        };

        act(() => {
            resizeCallback?.(
                [
                    {
                        target: screen.getByTestId('element-size'),
                        contentRect,
                        borderBoxSize: [boxSize],
                        contentBoxSize: [boxSize],
                        devicePixelContentBoxSize: [boxSize],
                    },
                ],
                observer,
            );
        });

        expect(screen.getByTestId('element-size')).toHaveTextContent('640x480');
    });
});
