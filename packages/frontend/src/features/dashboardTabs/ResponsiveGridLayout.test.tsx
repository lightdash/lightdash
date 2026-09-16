import { act, render, screen } from '@testing-library/react';
import { ResponsiveGridLayout } from './ResponsiveGridLayout';

describe('dashboard container resizing', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('reflows on container resize without a window event and keeps hidden tabs stable', () => {
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
        vi.stubGlobal(
            'requestAnimationFrame',
            (callback: FrameRequestCallback) => {
                callback(0);
                return 1;
            },
        );
        vi.stubGlobal('cancelAnimationFrame', () => {});

        const resize = (width: number) => {
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
});
