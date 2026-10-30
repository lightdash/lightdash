import { act, render, screen } from '@testing-library/react';
import { ResponsiveGridLayout } from './ResponsiveGridLayout';

const stubResizeObserver = () => {
    const observers = new Map<Element, ResizeObserverCallback>();
    vi.stubGlobal(
        'ResizeObserver',
        class {
            constructor(private callback: ResizeObserverCallback) {}
            observe(node: Element) {
                observers.set(node, this.callback);
            }
            disconnect() {}
        },
    );
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});

    return (width: number) => {
        act(() => {
            for (const [node, callback] of observers) {
                if (!node.isConnected) continue;
                callback(
                    [
                        { contentRect: { width, height: 80 } },
                    ] as ResizeObserverEntry[],
                    {} as ResizeObserver,
                );
            }
        });
    };
};

describe('dashboard container resizing', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('reflows on container resize without a window event and keeps hidden tabs stable', () => {
        const resize = stubResizeObserver();

        render(
            <ResponsiveGridLayout
                measureBeforeMount
                breakpoints={{ wide: 600, narrow: 0 }}
                cols={{ wide: 2, narrow: 1 }}
                margin={[0, 0]}
                containerPadding={[0, 0]}
                rowHeight={40}
                layouts={{
                    wide: [
                        { i: 'a', x: 0, y: 0, w: 1, h: 1 },
                        { i: 'b', x: 1, y: 0, w: 1, h: 1 },
                    ],
                    narrow: [
                        { i: 'a', x: 0, y: 0, w: 1, h: 1 },
                        { i: 'b', x: 0, y: 1, w: 1, h: 1 },
                    ],
                }}
                useCSSTransforms={false}
            >
                <div key="a" data-testid="first-tile" />
                <div key="b" data-testid="second-tile" />
            </ResponsiveGridLayout>,
        );

        expect(screen.queryByTestId('first-tile')).not.toBeInTheDocument();
        resize(700);
        expect(screen.getByTestId('second-tile')).toHaveStyle({
            left: '50%',
            top: '0px',
        });
        resize(300);
        expect(screen.getByTestId('second-tile')).toHaveStyle({
            left: '0px',
            top: '40px',
            width: '300px',
        });
        resize(0);
        expect(screen.getByTestId('second-tile')).toHaveStyle({
            width: '300px',
            top: '40px',
        });
    });

    it('reports the breakpoint the grid mounts at, not only later changes', () => {
        const resize = stubResizeObserver();
        const onBreakpointChange = vi.fn();

        render(
            <ResponsiveGridLayout
                measureBeforeMount
                breakpoints={{ wide: 600, narrow: 0 }}
                cols={{ wide: 2, narrow: 1 }}
                rowHeight={40}
                layouts={{ wide: [], narrow: [] }}
                onBreakpointChange={onBreakpointChange}
            />,
        );

        expect(onBreakpointChange).not.toHaveBeenCalled();
        resize(300);
        expect(onBreakpointChange).toHaveBeenCalledTimes(1);
        expect(onBreakpointChange).toHaveBeenCalledWith('narrow', 1);
        resize(700);
        expect(onBreakpointChange).toHaveBeenLastCalledWith('wide', 2);
    });

    it('settles on the measured breakpoint when the grid renders before measuring', () => {
        const resize = stubResizeObserver();
        const onBreakpointChange = vi.fn();

        render(
            <ResponsiveGridLayout
                breakpoints={{ wide: 600, narrow: 0 }}
                cols={{ wide: 2, narrow: 1 }}
                rowHeight={40}
                layouts={{ wide: [], narrow: [] }}
                onBreakpointChange={onBreakpointChange}
            />,
        );

        resize(300);
        expect(onBreakpointChange).toHaveBeenCalledWith('narrow', 1);
        expect(onBreakpointChange).not.toHaveBeenCalledWith('wide', 2);
        expect(onBreakpointChange).toHaveBeenLastCalledWith('narrow', 1);
    });
});
