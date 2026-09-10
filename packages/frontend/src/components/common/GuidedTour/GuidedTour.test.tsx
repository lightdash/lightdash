import { Popover } from '@mantine/core';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type FC } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import MantineModal from '../MantineModal';
import { GuidedTour, type GuidedTourStep } from './GuidedTour';

const steps: GuidedTourStep[] = [
    { target: null, title: 'Step one', body: 'first body' },
    { target: null, title: 'Step two', body: 'second body' },
    { target: null, title: 'Step three', body: 'third body' },
];

// jsdom has no layout; model visible controls with non-empty boxes.
beforeEach(() => {
    document.elementsFromPoint = () => [];
    Element.prototype.scrollIntoView = () => {};
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
        function (this: Element) {
            return this.hasAttribute('hidden')
                ? new DOMRect(0, 0, 0, 0)
                : new DOMRect(100, 100, 100, 30);
        },
    );
});
afterEach(() => vi.restoreAllMocks());

describe('GuidedTour', () => {
    it('renders nothing when closed', () => {
        renderWithProviders(
            <GuidedTour steps={steps} opened={false} onClose={vi.fn()} />,
        );
        expect(screen.queryByText('Step one')).not.toBeInTheDocument();
    });

    it('walks forward and back through steps', async () => {
        const user = userEvent.setup();
        renderWithProviders(
            <GuidedTour steps={steps} opened onClose={vi.fn()} />,
        );

        expect(screen.getByText('Step one')).toBeInTheDocument();
        // first step has no Back button
        expect(
            screen.queryByRole('button', { name: 'Back' }),
        ).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Next' }));
        expect(screen.getByText('Step two')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Back' }));
        expect(screen.getByText('Step one')).toBeInTheDocument();
    });

    it('closes when skipped', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        renderWithProviders(
            <GuidedTour steps={steps} opened onClose={onClose} />,
        );

        await user.click(screen.getByRole('button', { name: 'Skip' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('shows "Got it" on the last step and closes when finished', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        renderWithProviders(
            <GuidedTour steps={steps} opened onClose={onClose} />,
        );

        await user.click(screen.getByRole('button', { name: 'Next' }));
        await user.click(screen.getByRole('button', { name: 'Next' }));
        expect(screen.getByText('Step three')).toBeInTheDocument();

        const finish = screen.getByRole('button', { name: 'Got it' });
        await user.click(finish);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    // Hosts tell Got it from Skip by onFinish having run first, and record a
    // completion rather than a dismissal on that basis.
    it('fires onFinish before onClose on Got it, and not on Skip', async () => {
        const user = userEvent.setup();
        const calls: string[] = [];
        const onClose = vi.fn(() => calls.push('close'));
        const onFinish = vi.fn(() => calls.push('finish'));
        const { unmount } = renderWithProviders(
            <GuidedTour
                steps={steps}
                opened
                onClose={onClose}
                onFinish={onFinish}
            />,
        );

        await user.click(screen.getByRole('button', { name: 'Skip' }));
        expect(calls).toEqual(['close']);
        unmount();

        calls.length = 0;
        renderWithProviders(
            <GuidedTour
                steps={steps}
                opened
                onClose={onClose}
                onFinish={onFinish}
            />,
        );
        await user.click(screen.getByRole('button', { name: 'Next' }));
        await user.click(screen.getByRole('button', { name: 'Next' }));
        await user.click(screen.getByRole('button', { name: 'Got it' }));
        expect(calls).toEqual(['finish', 'close']);
    });

    it('keeps the next step hidden but allows skipping when its control never appears', async () => {
        vi.useFakeTimers();
        const onClose = vi.fn();
        const recovery = document.createElement('button');
        recovery.setAttribute('data-recovery', '');
        document.body.appendChild(recovery);
        try {
            const { unmount } = renderWithProviders(
                <GuidedTour
                    steps={[
                        { target: null, title: 'Step one', body: '' },
                        {
                            target: '[data-missing="true"]',
                            title: 'Step two',
                            body: '',
                            interactive: true,
                            via: ['[data-recovery]'],
                        },
                        { target: null, title: 'Step three', body: '' },
                    ]}
                    opened
                    onClose={onClose}
                    initialStepIndex={1}
                    initialBeacon={{ x: 10, y: 10 }}
                />,
            );

            expect(screen.queryByText('Step two')).not.toBeInTheDocument();

            // Not straight away: a control that renders a beat late must not
            // flash a centred card first.
            await act(async () => {
                await vi.advanceTimersByTimeAsync(3_000);
            });
            expect(screen.queryByText('Step two')).not.toBeInTheDocument();

            // Passing the old card-return timeout must not reveal the step.
            await act(async () => {
                await vi.advanceTimersByTimeAsync(2_000);
            });
            expect(screen.queryByText('Step two')).not.toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Skip' }),
            ).toBeInTheDocument();
            expect(screen.queryByText(/Still waiting/)).not.toBeInTheDocument();
            await act(() => vi.advanceTimersByTimeAsync(20_000));
            await act(() => vi.advanceTimersByTimeAsync(1_000));
            await act(() => vi.advanceTimersByTimeAsync(1_000));
            fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
            expect(onClose).toHaveBeenCalledTimes(1);
            unmount();
            await act(() => vi.advanceTimersByTimeAsync(20_000));
            expect(document.documentElement).not.toHaveClass(
                'ld-tour-beacon-cursor',
            );
        } finally {
            recovery.remove();
            vi.useRealTimers();
        }
    });

    it.each(['Next', 'click', 'input'] as const)(
        'waits for a visible destination after %s, then supports a targetless step',
        async (advance) => {
            vi.useFakeTimers();
            const host = document.createElement('div');
            host.innerHTML = '<input id="source" />';
            document.body.appendChild(host);
            const onNavigate = vi.fn();
            const onFinish = vi.fn();
            try {
                renderWithProviders(
                    <GuidedTour
                        steps={[
                            {
                                target: '#source',
                                title: 'Source step',
                                body: '',
                                interactive: true,
                                advanceOnTargetClick: advance === 'click',
                                advanceOnTargetInput: advance === 'input',
                            },
                            {
                                target: '#destination',
                                via: ['#source'],
                                title: 'Destination step',
                                body: 'Destination instructions',
                                route: '/destination',
                                interactive: true,
                                advanceOnTargetClick: true,
                            },
                            { target: null, title: 'Finished', body: '' },
                        ]}
                        opened
                        onClose={vi.fn()}
                        onFinish={onFinish}
                        onNavigate={onNavigate}
                    />,
                );
                await act(() => vi.advanceTimersByTimeAsync(1_000));
                if (advance === 'Next') {
                    fireEvent.click(
                        screen.getByRole('button', { name: 'Next' }),
                    );
                } else if (advance === 'click') {
                    fireEvent.click(host.querySelector('#source')!);
                } else {
                    fireEvent.input(host.querySelector('#source')!, {
                        target: { value: 'hello' },
                    });
                    await act(() => vi.advanceTimersByTimeAsync(1_000));
                }
                expect(onNavigate).toHaveBeenCalledWith('/destination');
                expect(
                    screen.queryByText('Destination step'),
                ).not.toBeInTheDocument();
                await act(() => vi.advanceTimersByTimeAsync(20_000));
                await act(() => vi.advanceTimersByTimeAsync(1_000));
                await act(() => vi.advanceTimersByTimeAsync(1_000));
                expect(
                    screen.queryByText('Destination instructions'),
                ).not.toBeInTheDocument();
                expect(
                    screen.queryByText(/Still waiting/),
                ).not.toBeInTheDocument();
                expect(
                    screen.getByRole('button', { name: 'Skip' }),
                ).toBeVisible();
                expect(onFinish).not.toHaveBeenCalled();

                host.innerHTML =
                    '<button id="destination" hidden>Destination</button>';
                await act(() => vi.advanceTimersByTimeAsync(1_000));
                expect(
                    screen.queryByText('Destination step'),
                ).not.toBeInTheDocument();

                host.querySelector('#destination')!.removeAttribute('hidden');
                await act(() => vi.advanceTimersByTimeAsync(1_000));
                await act(() => vi.advanceTimersByTimeAsync(1_000));
                expect(screen.getByText('Destination step')).toBeVisible();
                fireEvent.click(host.querySelector('#destination')!);
                await act(() => vi.advanceTimersByTimeAsync(1_000));
                expect(screen.getByText('Finished')).toBeVisible();
                fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
                expect(onFinish).toHaveBeenCalledTimes(1);
            } finally {
                host.remove();
                vi.useRealTimers();
            }
        },
    );

    // A step's target may sit behind a control only some instances show (a
    // chooser before the export form). While that control is on the page and
    // the target is not, the ring and the title move to it straight away;
    // once the target appears, the step is itself again.
    describe('detour', () => {
        const detourSteps: GuidedTourStep[] = [
            {
                target: '[data-x="download"]',
                title: 'Click Download',
                body: '',
                interactive: true,
                advanceOnTargetClick: true,
                detour: [
                    {
                        target: '[data-x="chooser"]',
                        title: 'Click Download data',
                    },
                ],
            },
        ];
        const mount = (html: string) => {
            const host = document.createElement('div');
            host.innerHTML = html;
            document.body.appendChild(host);
            return host;
        };

        it('spotlights the detour control while the target is missing', async () => {
            const host = mount(
                '<button data-x="chooser">Download data</button>',
            );
            try {
                renderWithProviders(
                    <GuidedTour steps={detourSteps} opened onClose={vi.fn()} />,
                );
                await waitFor(() =>
                    expect(
                        screen.getByText('Click Download data'),
                    ).toBeVisible(),
                );
                expect(
                    host.querySelector('[data-x="chooser"]'),
                ).toHaveAttribute('data-tour-active');

                host.innerHTML = '<button data-x="download">Download</button>';
                await waitFor(() =>
                    expect(screen.getByText('Click Download')).toBeVisible(),
                );
                expect(
                    screen.queryByText('Click Download data'),
                ).not.toBeInTheDocument();
                expect(
                    host.querySelector('[data-x="download"]'),
                ).toHaveAttribute('data-tour-active');
            } finally {
                host.remove();
            }
        });

        it('ignores the detour when the target is already there', async () => {
            const host = mount(
                '<button data-x="chooser">Download data</button><button data-x="download">Download</button>',
            );
            try {
                renderWithProviders(
                    <GuidedTour steps={detourSteps} opened onClose={vi.fn()} />,
                );
                await waitFor(() =>
                    expect(
                        host.querySelector('[data-x="download"]'),
                    ).toHaveAttribute('data-tour-active'),
                );
                expect(await screen.findByText('Click Download')).toBeVisible();
                expect(
                    screen.queryByText('Click Download data'),
                ).not.toBeInTheDocument();
            } finally {
                host.remove();
            }
        });
    });
});

/** A menu the learner opened on a step, as that step would leave it. */
const OpenMenu: FC = () => (
    <Popover defaultOpened>
        <Popover.Target>
            <button type="button">Categories</button>
        </Popover.Target>
        <Popover.Dropdown>
            <button type="button" data-in-menu>
                Sales
            </button>
        </Popover.Dropdown>
    </Popover>
);

// A menu a step opens survives the clicks that move the walkthrough on (the
// tour swallows the press that would close it), so the tour puts it away
// itself once it points somewhere else.
describe('GuidedTour and the menus a step opens', () => {
    it('closes a menu the step does not point into', async () => {
        renderWithProviders(
            <>
                <div data-on-page>The metrics table</div>
                <OpenMenu />
                <GuidedTour
                    steps={[
                        {
                            target: '[data-on-page]',
                            title: 'See the result',
                            body: '',
                        },
                    ]}
                    opened
                    onClose={vi.fn()}
                />
            </>,
        );

        await waitFor(() =>
            expect(screen.queryByText('Sales')).not.toBeInTheDocument(),
        );
    });

    it('leaves open the menu the step points into', async () => {
        renderWithProviders(
            <>
                <OpenMenu />
                <GuidedTour
                    steps={[
                        {
                            target: '[data-in-menu]',
                            title: 'Choose Sales',
                            body: '',
                        },
                    ]}
                    opened
                    onClose={vi.fn()}
                />
            </>,
        );

        await screen.findByText('Choose Sales');
        expect(screen.getByText('Sales')).toBeInTheDocument();
    });

    it('closes an open menu when the walkthrough ends', async () => {
        const user = userEvent.setup();
        renderWithProviders(
            <>
                <OpenMenu />
                <GuidedTour
                    steps={[
                        {
                            target: '[data-in-menu]',
                            title: 'Choose Sales',
                            body: '',
                        },
                    ]}
                    opened
                    onClose={vi.fn()}
                />
            </>,
        );

        expect(screen.getByText('Sales')).toBeInTheDocument();
        await user.click(await screen.findByRole('button', { name: 'Got it' }));
        await waitFor(() =>
            expect(screen.queryByText('Sales')).not.toBeInTheDocument(),
        );
    });

    // Only menus: a dialog a step opened is part of what the walkthrough is
    // teaching, and the host shows the completion dialog over it.
    it('leaves an open dialog alone', async () => {
        const user = userEvent.setup();
        renderWithProviders(
            <>
                <MantineModal opened onClose={vi.fn()} title="Save chart">
                    <div>Chart name</div>
                </MantineModal>
                <GuidedTour
                    steps={[{ target: null, title: 'Step one', body: '' }]}
                    opened
                    onClose={vi.fn()}
                />
            </>,
        );

        await user.click(screen.getByRole('button', { name: 'Got it' }));
        expect(screen.getByText('Chart name')).toBeInTheDocument();
    });
});
