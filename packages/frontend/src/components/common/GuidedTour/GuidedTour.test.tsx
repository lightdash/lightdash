import { Button, Popover, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type FC } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import MantineModal from '../MantineModal';
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

    it('updates controlled form state when accepting a suggested name', async () => {
        const Form = () => {
            const form = useForm({ initialValues: { name: '' } });
            return (
                <>
                    <TextInput
                        aria-label="Dashboard name"
                        data-name-field
                        {...form.getInputProps('name')}
                    />
                    <Button disabled={!form.values.name}>
                        Create dashboard
                    </Button>
                    <GuidedTour
                        steps={[
                            {
                                target: '[data-name-field]',
                                title: 'Name your dashboard',
                                body: '',
                                interactive: true,
                                advanceOnTargetInput: true,
                                suggestion: 'Orders overview',
                            },
                        ]}
                        opened
                        onClose={vi.fn()}
                    />
                </>
            );
        };
        const user = userEvent.setup();
        renderWithProviders(<Form />);
        expect(
            screen.getByRole('button', { name: 'Create dashboard' }),
        ).toBeDisabled();
        await user.click(screen.getByRole('button', { name: 'Use it' }));
        expect(
            screen.getByRole('textbox', { name: 'Dashboard name' }),
        ).toHaveValue('Orders overview');
        expect(
            screen.getByRole('button', { name: 'Create dashboard' }),
        ).toBeEnabled();
    });

    it('does not advance a typed step when its field resets before settling', async () => {
        const onStepChange = vi.fn();
        const onClose = vi.fn();
        const Form = () => {
            const [name, setName] = useState('');
            return (
                <>
                    <input
                        aria-label="Transient name"
                        data-transient-name
                        value={name}
                        onChange={(event) => {
                            setName(event.currentTarget.value);
                            window.setTimeout(() => setName(''), 20);
                        }}
                    />
                    <GuidedTour
                        steps={[
                            {
                                target: '[data-transient-name]',
                                title: 'Name',
                                body: '',
                                interactive: true,
                                advanceOnTargetInput: true,
                                suggestion: 'Orders overview',
                            },
                            { target: null, title: 'Next step', body: '' },
                        ]}
                        opened
                        onClose={onClose}
                        onStepChange={onStepChange}
                    />
                </>
            );
        };
        const user = userEvent.setup();
        renderWithProviders(<Form />);
        await user.click(screen.getByRole('button', { name: 'Use it' }));
        await waitFor(() =>
            expect(
                screen.getByRole('textbox', { name: 'Transient name' }),
            ).toHaveValue(''),
        );
        await act(
            async () =>
                new Promise((resolve) => window.setTimeout(resolve, 1100)),
        );
        expect(onStepChange).not.toHaveBeenCalled();
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

    it.each([
        { entry: 'resume', change: 'moves', changeAt: 700 },
        { entry: 'click', change: 'moves', changeAt: 700 },
        { entry: 'resume', change: 'moves', changeAt: 1100 },
        { entry: 'resume', change: 'disappears', changeAt: 700 },
    ])(
        'positions the card after the target $change at $changeAt ms ($entry)',
        async ({ entry, change, changeAt }) => {
            vi.useFakeTimers();
            vi.stubGlobal('innerWidth', 1280);
            vi.stubGlobal('innerHeight', 768);
            const heading = document.createElement('button');
            heading.setAttribute('data-results', '');
            document.body.appendChild(heading);
            const target = document.createElement('button');
            target.setAttribute('data-export', '');
            document.body.appendChild(target);
            let targetRect = new DOMRect(1100, 500, 32, 32);
            const rectSpy = vi
                .spyOn(target, 'getBoundingClientRect')
                .mockImplementation(() => targetRect);
            const { unmount } = renderWithProviders(
                <GuidedTour
                    steps={[
                        {
                            target: '[data-results]',
                            title: 'Open results',
                            body: '',
                            interactive: true,
                            advanceOnTargetClick: true,
                        },
                        {
                            target: '[data-export]',
                            title: 'Export results',
                            body: '',
                            interactive: true,
                            advanceOnTargetClick: true,
                        },
                    ]}
                    opened
                    onClose={vi.fn()}
                    initialStepIndex={entry === 'resume' ? 1 : 0}
                    initialBeacon={
                        entry === 'resume' ? { x: 100, y: 100 } : null
                    }
                />,
            );
            // Let React commit each sampled frame, including the expansion timers.
            const advanceFrames = async (ms: number) => {
                for (let elapsed = 0; elapsed < ms; elapsed += 20) {
                    await act(async () => {
                        await vi.advanceTimersByTimeAsync(20);
                    });
                }
            };
            try {
                if (entry === 'click') {
                    await advanceFrames(1000);
                    fireEvent.click(heading);
                }
                await advanceFrames(changeAt);
                if (change === 'disappears') {
                    target.remove();
                } else {
                    targetRect = new DOMRect(1100, 400, 32, 32);
                }
                await advanceFrames(1600 - changeAt);

                const card = screen
                    .getByText('Export results')
                    .closest('[data-tour-card]')?.parentElement;
                // The old top (266px) covers the target at y=400; below is clear.
                expect(card?.style.getPropertyValue('--tour-card-top')).toBe(
                    change === 'disappears' ? '' : '446px',
                );
                expect(
                    screen.getByRole('button', { name: 'Skip' }),
                ).toBeVisible();
            } finally {
                unmount();
                target.remove();
                heading.remove();
                rectSpy.mockRestore();
                vi.useRealTimers();
                vi.unstubAllGlobals();
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

        it('offers a fallback click before a missing typed field can accept its suggestion', async () => {
            const user = userEvent.setup();
            const host = mount('<button data-x="open-form">Open form</button>');
            host.querySelector('button')!.onclick = () => {
                host.innerHTML = '<input data-x="name" aria-label="Name" />';
            };
            try {
                renderWithProviders(
                    <GuidedTour
                        steps={[
                            {
                                target: '[data-x="name"]',
                                title: 'Name your dashboard',
                                body: '',
                                interactive: true,
                                advanceOnTargetInput: true,
                                suggestion: 'Orders overview',
                                detour: [
                                    {
                                        target: '[data-x="open-form"]',
                                        title: 'Open form',
                                    },
                                ],
                            },
                        ]}
                        opened
                        onClose={vi.fn()}
                    />,
                );
                await waitFor(() =>
                    expect(host.querySelector('button')).toHaveAttribute(
                        'data-tour-active',
                    ),
                );
                expect(
                    screen.queryByRole('button', { name: 'Use it' }),
                ).not.toBeInTheDocument();
                expect(
                    screen.getByText(
                        'Click the highlighted control to continue',
                    ),
                ).toBeVisible();
                await user.click(host.querySelector('button')!);
                await waitFor(() =>
                    expect(
                        screen.getByRole('button', { name: 'Use it' }),
                    ).toBeVisible(),
                );
                await user.click(
                    screen.getByRole('button', { name: 'Use it' }),
                );
                expect(
                    screen.getByRole('textbox', { name: 'Name' }),
                ).toHaveValue('Orders overview');
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
        await user.click(screen.getByRole('button', { name: 'Got it' }));
        await waitFor(() =>
            expect(screen.queryByText('Sales')).not.toBeInTheDocument(),
        );
    });

    // Only menus: a dialog a step opened is part of what the walkthrough is
    // teaching, and the host shows the completion dialog over it.
    it('closes a dropdown without closing the dialog beside it', async () => {
        const closeDialog = vi.fn();
        const Page = () => {
            const [opened, setOpened] = useState(true);
            return (
                <>
                    <OpenMenu />
                    <MantineModal
                        opened={opened}
                        onClose={() => {
                            closeDialog();
                            setOpened(false);
                        }}
                        title="Save chart"
                    >
                        <div id="chart-name">Chart name</div>
                    </MantineModal>
                    <GuidedTour
                        steps={[
                            {
                                target: '#chart-name',
                                title: 'Name chart',
                                body: '',
                            },
                        ]}
                        opened
                        onClose={vi.fn()}
                    />
                </>
            );
        };
        renderWithProviders(<Page />);
        await waitFor(() =>
            expect(screen.queryByText('Sales')).not.toBeInTheDocument(),
        );
        expect(closeDialog).not.toHaveBeenCalled();
        expect(screen.getByText('Chart name')).toBeInTheDocument();
    });
});
