import {
    SchedulerFormat,
    type AppQuerySelection,
    type DeliveryCaptureManifest,
    type SchedulerAppState,
} from '@lightdash/common';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
    type ComponentProps,
    type FC,
    type MutableRefObject,
    type ReactNode,
} from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import {
    DEFAULT_VALUES,
    SchedulerFormProvider,
    useSchedulerForm,
    type SchedulerFormValues,
} from '../schedulerFormContext';

type SchedulerForm = ReturnType<typeof useSchedulerForm>;

type CaptureProps = {
    projectUuid: string;
    appUuid: string;
    appState: SchedulerAppState | null;
    onManifest: (manifest: DeliveryCaptureManifest) => void;
    onError: (message: string) => void;
};

const mocks = vi.hoisted(() => ({
    capture: vi.fn((_props: CaptureProps) => null),
}));

vi.mock('../../../../apps/deliveryCapture/AppDeliveryPreviewCapture', () => ({
    default: mocks.capture,
}));

vi.mock('../../../../../hooks/useProjectUuid', () => ({
    useProjectUuid: vi.fn(() => 'project-uuid'),
}));

// eslint-disable-next-line import/first
import { SchedulerAppQueriesSection } from './SchedulerAppQueriesSection';

const latestCaptureProps = (): CaptureProps => {
    const { calls } = mocks.capture.mock;
    if (calls.length === 0) throw new Error('capture never mounted');
    return calls[calls.length - 1][0];
};

const FormWrapper: FC<{
    initialValues: SchedulerFormValues;
    formRef?: MutableRefObject<SchedulerForm | null>;
    children: ReactNode;
}> = ({ initialValues, formRef, children }) => {
    const form = useSchedulerForm({ initialValues });
    if (formRef) formRef.current = form;
    return (
        <SchedulerFormProvider form={form}>{children}</SchedulerFormProvider>
    );
};

const AVAILABLE_APP_STATE = { tab: 'overview' };

const APP_FORM_VALUES: SchedulerFormValues = {
    ...DEFAULT_VALUES,
    format: SchedulerFormat.CSV,
};

const renderSection = (
    initialValues: SchedulerFormValues = APP_FORM_VALUES,
    props: Partial<ComponentProps<typeof SchedulerAppQueriesSection>> = {},
    formRef?: MutableRefObject<SchedulerForm | null>,
) =>
    renderWithProviders(
        <FormWrapper initialValues={initialValues} formRef={formRef}>
            <SchedulerAppQueriesSection
                appUuid="app-uuid"
                availableAppState={AVAILABLE_APP_STATE}
                {...props}
            />
        </FormWrapper>,
    );

const manifest = (
    items: DeliveryCaptureManifest['items'],
    overflowCount = 0,
): DeliveryCaptureManifest => ({ version: 1, items, overflowCount });

const readyItem = (
    overrides: Partial<
        Extract<DeliveryCaptureManifest['items'][number], { status: 'ready' }>
    > = {},
) => ({
    status: 'ready' as const,
    captureKey: 'v1:key-a',
    label: 'Revenue',
    exploreName: 'orders',
    queryUuid: 'query-a',
    order: 0,
    rowCount: 12,
    limitReached: false,
    ...overrides,
});

const selection = (
    overrides: Partial<AppQuerySelection> = {},
): AppQuerySelection => ({
    captureKey: 'v1:key-a',
    label: 'Revenue',
    exploreName: 'orders',
    excluded: false,
    ...overrides,
});

const expandPicker = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Choose queries' }));
};

const emitManifest = (m: DeliveryCaptureManifest) => {
    act(() => {
        latestCaptureProps().onManifest(m);
    });
};

describe('SchedulerAppQueriesSection', () => {
    beforeEach(() => {
        mocks.capture.mockClear();
    });

    it('does not start the preview render until the picker is expanded', async () => {
        const user = userEvent.setup();
        renderSection();

        expect(mocks.capture).not.toHaveBeenCalled();

        await expandPicker(user);

        expect(mocks.capture).toHaveBeenCalled();
        expect(
            screen.getByText('Running the app to detect its data queries…'),
        ).toBeInTheDocument();
    });

    it('runs the render under the to-be-saved app state', async () => {
        const user = userEvent.setup();
        renderSection({
            ...APP_FORM_VALUES,
            appState: { tab: 'saved-tab' },
        });

        await expandPicker(user);

        expect(latestCaptureProps()).toMatchObject({
            projectUuid: 'project-uuid',
            appUuid: 'app-uuid',
            appState: { tab: 'saved-tab' },
        });
    });

    it('falls back to the available app state when the form has none yet', async () => {
        const user = userEvent.setup();
        renderSection({ ...APP_FORM_VALUES, appState: null });

        await expandPicker(user);

        expect(latestCaptureProps().appState).toEqual(AVAILABLE_APP_STATE);
    });

    it('shows the no-curation fallback on failure and re-runs on retry', async () => {
        const user = userEvent.setup();
        renderSection();

        await expandPicker(user);
        act(() => {
            latestCaptureProps().onError('boom');
        });

        expect(
            screen.getByText("Couldn't detect this app's queries"),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'You can still save this delivery — every query the app runs will be included.',
            ),
        ).toBeInTheDocument();

        const mountsBeforeRetry = mocks.capture.mock.calls.length;
        await user.click(screen.getByRole('button', { name: 'Try again' }));

        expect(mocks.capture.mock.calls.length).toBeGreaterThan(
            mountsBeforeRetry,
        );
        expect(
            screen.getByText('Running the app to detect its data queries…'),
        ).toBeInTheDocument();
    });

    it('re-runs the render when re-expanded after a failure', async () => {
        const user = userEvent.setup();
        renderSection();

        await expandPicker(user);
        act(() => {
            latestCaptureProps().onError('boom');
        });

        // Collapse and re-expand — a fresh render starts.
        await expandPicker(user);
        const mountsWhileCollapsed = mocks.capture.mock.calls.length;
        await expandPicker(user);

        expect(mocks.capture.mock.calls.length).toBeGreaterThan(
            mountsWhileCollapsed,
        );
        expect(
            screen.getByText('Running the app to detect its data queries…'),
        ).toBeInTheDocument();
    });

    it('renders rows with indicative counts, limit and error badges, and the overflow notice', async () => {
        const user = userEvent.setup();
        renderSection();

        await expandPicker(user);
        emitManifest(
            manifest(
                [
                    readyItem({ rowCount: 500, limitReached: true }),
                    {
                        status: 'error',
                        captureKey: 'v1:key-err',
                        label: 'Broken',
                        exploreName: 'orders',
                        queryUuid: null,
                        order: 1,
                        error: 'query exploded',
                    },
                ],
                2,
            ),
        );

        expect(screen.getByRole('checkbox', { name: /Revenue/ })).toBeChecked();
        expect(screen.getByText('~500 rows')).toBeInTheDocument();
        expect(screen.getByText('limit reached')).toBeInTheDocument();
        expect(screen.getByText('error')).toBeInTheDocument();
        expect(screen.getByText('query exploded')).toBeInTheDocument();
        expect(
            screen.getByText(
                'Row counts come from this preview and may differ at delivery time.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                "2 more queries ran past the 50-query capture limit and can't be selected here.",
            ),
        ).toBeInTheDocument();
    });

    it('shows an empty state when the app ran no queries', async () => {
        const user = userEvent.setup();
        renderSection();

        await expandPicker(user);
        emitManifest(manifest([]));

        expect(
            screen.getByText('This app ran no data queries in the preview.'),
        ).toBeInTheDocument();
    });

    it('persists a full snapshot and forces the app state on the first exclusion', async () => {
        const formRef: MutableRefObject<SchedulerForm | null> = {
            current: null,
        };
        const user = userEvent.setup();
        renderSection({ ...APP_FORM_VALUES, appState: null }, {}, formRef);

        await expandPicker(user);
        emitManifest(
            manifest([
                readyItem(),
                readyItem({
                    captureKey: 'v1:key-b',
                    label: 'Customers',
                    exploreName: 'customers',
                    queryUuid: 'query-b',
                    order: 1,
                }),
            ]),
        );

        await user.click(screen.getByRole('checkbox', { name: /Revenue/ }));

        // Full snapshot — every visible row, not just the toggled one.
        expect(formRef.current?.values.appQuerySelections).toEqual([
            {
                captureKey: 'v1:key-a',
                label: 'Revenue',
                exploreName: 'orders',
                excluded: true,
            },
            {
                captureKey: 'v1:key-b',
                label: 'Customers',
                exploreName: 'customers',
                excluded: false,
            },
        ]);
        // Curation implies state.
        expect(formRef.current?.values.appState).toEqual(AVAILABLE_APP_STATE);
    });

    it('keeps the snapshot when the user re-includes everything', async () => {
        const formRef: MutableRefObject<SchedulerForm | null> = {
            current: null,
        };
        const user = userEvent.setup();
        renderSection(APP_FORM_VALUES, {}, formRef);

        await expandPicker(user);
        emitManifest(manifest([readyItem()]));

        await user.click(screen.getByRole('checkbox', { name: /Revenue/ }));
        await user.click(screen.getByRole('checkbox', { name: /Revenue/ }));

        expect(formRef.current?.values.appQuerySelections).toEqual([
            {
                captureKey: 'v1:key-a',
                label: 'Revenue',
                exploreName: 'orders',
                excluded: false,
            },
        ]);
    });

    it('warns when every query is excluded', async () => {
        const user = userEvent.setup();
        renderSection();

        await expandPicker(user);
        emitManifest(manifest([readyItem()]));
        await user.click(screen.getByRole('checkbox', { name: /Revenue/ }));

        expect(
            screen.getByText(
                'Every query is excluded, so this delivery would be empty. Include at least one query.',
            ),
        ).toBeInTheDocument();
    });

    describe('edit-mode merge', () => {
        it('applies saved exclusions, keeps did-not-run rows, and includes new queries by default', async () => {
            const user = userEvent.setup();
            renderSection({
                ...APP_FORM_VALUES,
                appState: AVAILABLE_APP_STATE,
                appQuerySelections: [
                    selection({ excluded: true }),
                    selection({
                        captureKey: 'v1:key-gone',
                        label: 'Gone query',
                        exploreName: 'customers',
                        excluded: false,
                    }),
                ],
            });

            await expandPicker(user);
            emitManifest(
                manifest([
                    readyItem(),
                    readyItem({
                        captureKey: 'v1:key-new',
                        label: 'Brand new',
                        exploreName: 'payments',
                        queryUuid: 'query-new',
                        order: 1,
                    }),
                ]),
            );

            // Saved exclusion applies by captureKey.
            expect(
                screen.getByRole('checkbox', { name: /Revenue/ }),
            ).not.toBeChecked();
            // Fresh query not in the snapshot starts included.
            expect(
                screen.getByRole('checkbox', { name: /Brand new/ }),
            ).toBeChecked();
            // Snapshot entry that did not run stays visible and toggleable.
            const goneCheckbox = screen.getByRole('checkbox', {
                name: /Gone query/,
            });
            expect(goneCheckbox).toBeChecked();
            expect(goneCheckbox).toBeEnabled();
            expect(
                screen.getByText("didn't run in preview"),
            ).toBeInTheDocument();
        });

        it('shows the identity-changed hint for a label+explore match with a different key', async () => {
            const user = userEvent.setup();
            renderSection({
                ...APP_FORM_VALUES,
                appState: AVAILABLE_APP_STATE,
                appQuerySelections: [selection({ excluded: true })],
            });

            await expandPicker(user);
            emitManifest(manifest([readyItem({ captureKey: 'v1:key-a2' })]));

            // Stale exclusion is not trusted — the row starts included.
            expect(
                screen.getByRole('checkbox', { name: /Revenue/ }),
            ).toBeChecked();
            expect(
                screen.getByText(
                    'This query changed since the delivery was last saved — its previous selection no longer applies.',
                ),
            ).toBeInTheDocument();
        });
    });

    it('disables curation when there is no app state to pin', async () => {
        const user = userEvent.setup();
        renderSection(
            { ...APP_FORM_VALUES, appState: null },
            { availableAppState: null },
        );

        await expandPicker(user);
        emitManifest(manifest([readyItem()]));

        expect(
            screen.getByRole('checkbox', { name: /Revenue/ }),
        ).toBeDisabled();
        expect(
            screen.getByText(
                'Choosing queries requires sending app state with the delivery, and this app has no state to send.',
            ),
        ).toBeInTheDocument();
    });

    it('summarises exclusions while collapsed', async () => {
        const user = userEvent.setup();
        renderSection({
            ...APP_FORM_VALUES,
            appQuerySelections: [
                selection({ excluded: true }),
                selection({ captureKey: 'v1:key-b', label: 'Customers' }),
            ],
        });

        expect(screen.getByText('1 of 2 queries excluded')).toBeInTheDocument();

        // The summary is redundant while the rows themselves are visible.
        await expandPicker(user);
        expect(
            screen.queryByText('1 of 2 queries excluded'),
        ).not.toBeInTheDocument();
    });

    describe('stale-manifest invalidation', () => {
        const LOADING_COPY = 'Running the app to detect its data queries…';

        it('re-runs the render when the to-be-saved app state changes after ready', async () => {
            const formRef: MutableRefObject<SchedulerForm | null> = {
                current: null,
            };
            const user = userEvent.setup();
            renderSection(
                { ...APP_FORM_VALUES, appState: { tab: 'saved' } },
                {},
                formRef,
            );

            await expandPicker(user);
            emitManifest(manifest([readyItem()]));
            expect(screen.queryByText(LOADING_COPY)).not.toBeInTheDocument();

            act(() => {
                formRef.current?.setFieldValue('appState', { tab: 'other' });
            });

            // Manifest discarded, fresh render under the new state.
            expect(screen.getByText(LOADING_COPY)).toBeInTheDocument();
            expect(latestCaptureProps().appState).toEqual({ tab: 'other' });
        });

        it('does not re-run when the state is replaced with an equal value', async () => {
            const formRef: MutableRefObject<SchedulerForm | null> = {
                current: null,
            };
            const user = userEvent.setup();
            renderSection(
                { ...APP_FORM_VALUES, appState: { tab: 'saved' } },
                {},
                formRef,
            );

            await expandPicker(user);
            emitManifest(manifest([readyItem()]));

            // New object identity, identical content — must not invalidate.
            act(() => {
                formRef.current?.setFieldValue('appState', { tab: 'saved' });
            });

            expect(screen.queryByText(LOADING_COPY)).not.toBeInTheDocument();
            expect(
                screen.getByRole('checkbox', { name: /Revenue/ }),
            ).toBeInTheDocument();
        });

        it('keeps exclusions across a state-triggered re-render where captureKeys still match', async () => {
            const formRef: MutableRefObject<SchedulerForm | null> = {
                current: null,
            };
            const user = userEvent.setup();
            renderSection({ ...APP_FORM_VALUES, appState: null }, {}, formRef);

            await expandPicker(user);
            emitManifest(manifest([readyItem()]));
            await user.click(screen.getByRole('checkbox', { name: /Revenue/ }));

            // The exclusion pinned the app state — same content as the render
            // ran under, so it must NOT trigger a re-render (loop guard).
            expect(screen.queryByText(LOADING_COPY)).not.toBeInTheDocument();

            act(() => {
                formRef.current?.setFieldValue('appState', { tab: 'other' });
            });
            expect(screen.getByText(LOADING_COPY)).toBeInTheDocument();

            emitManifest(
                manifest([
                    readyItem(),
                    readyItem({
                        captureKey: 'v1:key-new',
                        label: 'Brand new',
                        exploreName: 'payments',
                        queryUuid: 'query-new',
                        order: 1,
                    }),
                ]),
            );

            // The earlier exclusion survives the merge by captureKey.
            expect(
                screen.getByRole('checkbox', { name: /Revenue/ }),
            ).not.toBeChecked();
            expect(
                screen.getByRole('checkbox', { name: /Brand new/ }),
            ).toBeChecked();
        });
    });
});
