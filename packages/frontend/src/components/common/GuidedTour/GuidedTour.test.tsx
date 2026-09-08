import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { GuidedTour, type GuidedTourStep } from './GuidedTour';

const steps: GuidedTourStep[] = [
    { target: null, title: 'Step one', body: 'first body' },
    { target: null, title: 'Step two', body: 'second body' },
    { target: null, title: 'Step three', body: 'third body' },
];

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

    // A control the instance never shows (a screen behind a config the tour
    // did not know about) used to leave the page blocked with no card and no
    // Skip: the only way out was a new tab.
    it('brings the card back when the next control never appears', async () => {
        vi.useFakeTimers();
        try {
            renderWithProviders(
                <GuidedTour
                    steps={[
                        { target: null, title: 'Step one', body: '' },
                        {
                            target: '[data-missing="true"]',
                            title: 'Step two',
                            body: '',
                            interactive: true,
                            advanceOnTargetClick: true,
                        },
                    ]}
                    opened
                    onClose={vi.fn()}
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

            // Well before the 15 s path patience: the learner needs to see
            // the tour is alive long before that.
            await act(async () => {
                await vi.advanceTimersByTimeAsync(2_000);
            });
            expect(screen.getByText('Step two')).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Skip' }),
            ).toBeInTheDocument();
            expect(screen.getByText(/Still waiting/)).toBeInTheDocument();
        } finally {
            vi.useRealTimers();
        }
    });

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
        // jsdom has no layout: the tour's viewport checks need these to exist.
        beforeEach(() => {
            document.elementsFromPoint = () => [];
            Element.prototype.scrollIntoView = () => {};
        });
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
                expect(screen.getByText('Click Download')).toBeVisible();
                expect(
                    screen.queryByText('Click Download data'),
                ).not.toBeInTheDocument();
            } finally {
                host.remove();
            }
        });
    });
});
