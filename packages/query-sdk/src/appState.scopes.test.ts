/**
 * Scope routing for the unified `useAppState(key, default, { scope })` hook:
 * one hook over url, user and shared state, with `useUrlState` and
 * `useSharedAppState` as aliases. Modules are re-imported per test because
 * both state modules keep singletons (URL store, per-transport app stores).
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppStateSnapshot, AppStateTransport, Transport } from './types';

const mockAppStateTransport = (
    snapshot: AppStateSnapshot = { user: {}, shared: {} },
): AppStateTransport => ({
    getSnapshot: vi.fn(async () => snapshot),
    setUser: vi.fn(async (_key: string, value: unknown) => ({
        value,
        updatedAt: '2026-11-10T01:00:00.000Z',
    })),
    deleteUser: vi.fn(async () => undefined),
    setShared: vi.fn(async (_key: string, value: unknown) => ({
        value,
        version: 1,
        updatedAt: '2026-11-10T01:00:00.000Z',
        updatedBy: { userUuid: 'u-1', name: 'Alice' },
    })),
    deleteShared: vi.fn(async () => undefined),
    getSharedHistory: vi.fn(async () => []),
});

// Each transport object gets its own store (WeakMap-keyed), so a fresh
// transport per test isolates app state; URL state needs resetModules.
const makeTransport = (appState: AppStateTransport | null): Transport =>
    ({ appState: appState ?? undefined }) as unknown as Transport;

const setPageUrl = (url: string) => {
    window.history.replaceState(null, '', url);
};

describe('useAppState scopes', () => {
    let root: Root | undefined;
    let container: HTMLDivElement | undefined;

    beforeEach(() => {
        vi.resetModules();
        setPageUrl('/');
    });

    afterEach(async () => {
        await act(async () => root?.unmount());
        container?.remove();
        root = undefined;
        container = undefined;
        vi.restoreAllMocks();
    });

    const mount = async <C>(
        transport: Transport | null,
        useHook: () => C,
    ): Promise<{ current: () => C }> => {
        const sdk = await import('./LightdashProvider');
        let latest: C | undefined;
        function Probe() {
            latest = useHook();
            return null;
        }
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        await act(async () => {
            root?.render(
                transport
                    ? createElement(sdk.LightdashProvider, {
                          transport,
                          children: createElement(Probe),
                      })
                    : createElement(Probe),
            );
        });
        return {
            current: () => {
                if (!latest) throw new Error('hook did not render');
                return latest;
            },
        };
    };

    const settle = async () => {
        // First write flushes on a 0ms timer after load resolves.
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
        });
    };

    it('defaults to user scope: saves per person through the transport', async () => {
        const { useAppState } = await import('./appState');
        const appState = mockAppStateTransport({
            user: {
                period: {
                    value: 'ytd',
                    updatedAt: '2026-11-09T00:00:00.000Z',
                },
            },
            shared: {},
        });
        const probe = await mount(makeTransport(appState), () => {
            const [value, set, meta] = useAppState('period', 'last_month');
            return { value, set, meta };
        });
        await settle();
        expect(probe.current().value).toBe('ytd');
        expect(probe.current().meta.persisted).toBe(true);

        await act(async () => probe.current().set('last_week'));
        await settle();
        expect(appState.setUser).toHaveBeenCalledWith('period', 'last_week');
        expect(appState.setShared).not.toHaveBeenCalled();
    });

    it('shared scope reads and writes the shared value with version meta', async () => {
        const { useAppState } = await import('./appState');
        const appState = mockAppStateTransport({
            user: {},
            shared: {
                targets: {
                    value: { q3: 100 },
                    version: 7,
                    updatedAt: '2026-11-09T00:00:00.000Z',
                    updatedBy: { userUuid: 'u-2', name: 'Bob' },
                },
            },
        });
        const probe = await mount(makeTransport(appState), () => {
            const [value, set, meta] = useAppState(
                'targets',
                {} as Record<string, number>,
                { scope: 'shared' },
            );
            return { value, set, meta };
        });
        await settle();
        expect(probe.current().value).toEqual({ q3: 100 });
        expect(probe.current().meta.version).toBe(7);
        expect(probe.current().meta.updatedBy).toEqual({
            userUuid: 'u-2',
            name: 'Bob',
        });

        await act(async () => probe.current().set({ q3: 120 }));
        await settle();
        expect(appState.setShared).toHaveBeenCalledWith(
            'targets',
            { q3: 120 },
            7,
        );
        expect(appState.setUser).not.toHaveBeenCalled();
    });

    it('useSharedAppState is an alias for shared scope', async () => {
        const { useSharedAppState } = await import('./appState');
        const appState = mockAppStateTransport();
        const probe = await mount(makeTransport(appState), () => {
            const [value, set, meta] = useSharedAppState<string[]>('notes', []);
            return { value, set, meta };
        });
        await act(async () => probe.current().set(['hello']));
        await settle();
        expect(appState.setShared).toHaveBeenCalledWith(
            'notes',
            ['hello'],
            null,
        );
    });

    it('reports shared values as forbidden up front and sends no shared writes when the viewer has no access', async () => {
        const { useAppState, useSharedAppState } = await import('./appState');
        const appState = mockAppStateTransport({
            user: {},
            shared: {},
            sharedAccess: 'none',
        });
        const probe = await mount(makeTransport(appState), () => {
            const [notes, setNotes, notesMeta] = useSharedAppState<string[]>(
                'notes',
                [],
            );
            const [period, setPeriod, periodMeta] = useAppState(
                'period',
                'last_month',
            );
            return {
                notes,
                setNotes,
                notesMeta,
                period,
                setPeriod,
                periodMeta,
            };
        });
        await settle();
        expect(probe.current().notesMeta).toMatchObject({
            loading: false,
            persisted: false,
            saved: false,
        });
        expect(probe.current().notesMeta.error?.code).toBe('forbidden');

        await act(async () => probe.current().setNotes(['hello']));
        await settle();
        expect(appState.setShared).not.toHaveBeenCalled();
        expect(probe.current().notes).toEqual([]);

        // Per-person values keep working.
        expect(probe.current().periodMeta).toMatchObject({
            error: null,
            persisted: true,
        });
        await act(async () => probe.current().setPeriod('ytd'));
        await settle();
        expect(appState.setUser).toHaveBeenCalledWith('period', 'ytd');
    });

    it('url scope seeds from ?state= and writes back to the page URL, never the transport', async () => {
        setPageUrl(
            `/?state=${encodeURIComponent(JSON.stringify({ view: 'chart' }))}`,
        );
        const { useAppState } = await import('./appState');
        const appState = mockAppStateTransport();
        const probe = await mount(makeTransport(appState), () => {
            const [value, set, meta] = useAppState('view', 'table', {
                scope: 'url',
            });
            return { value, set, meta };
        });
        expect(probe.current().value).toBe('chart');
        expect(probe.current().meta).toEqual({
            loading: false,
            error: null,
            persisted: true,
            saved: true,
        });

        await act(async () => probe.current().set('map'));
        await settle();
        const state = new URLSearchParams(window.location.search).get('state');
        expect(JSON.parse(state ?? '{}')).toEqual({ view: 'map' });
        expect(appState.setUser).not.toHaveBeenCalled();
        expect(appState.setShared).not.toHaveBeenCalled();
    });

    it('url scope never touches the durable store, even with a provider', async () => {
        const { useAppState } = await import('./appState');
        const appState = mockAppStateTransport();
        const probe = await mount(makeTransport(appState), () => {
            const [value, set, meta] = useAppState('view', 'table', {
                scope: 'url',
            });
            return { value, set, meta };
        });
        await act(async () => probe.current().set('map'));
        await settle();
        // No snapshot fetch and no writes: a url-only app (e.g. the global
        // filter provider) must not hit the app-state API at all.
        expect(appState.getSnapshot).not.toHaveBeenCalled();
        expect(appState.setUser).not.toHaveBeenCalled();
    });

    it('accepts a value typed as AppStateOptions (no literal scope)', async () => {
        const { useAppState } = await import('./appState');
        const appState = mockAppStateTransport();
        const options: import('./appState').AppStateOptions = { url: true };
        const probe = await mount(makeTransport(appState), () => {
            const [value, set, meta] = useAppState(
                'period',
                'last_month',
                options,
            );
            return { value, set, meta };
        });
        await settle();
        expect(probe.current().value).toBe('last_month');
    });

    it('url scope works without a LightdashProvider', async () => {
        const warn = vi
            .spyOn(console, 'warn')
            .mockImplementation(() => undefined);
        const { useAppState } = await import('./appState');
        const probe = await mount(null, () => {
            const [value, set, meta] = useAppState('tab', 'overview', {
                scope: 'url',
            });
            return { value, set, meta };
        });
        expect(probe.current().value).toBe('overview');
        await act(async () => probe.current().set('details'));
        await settle();
        const state = new URLSearchParams(window.location.search).get('state');
        expect(JSON.parse(state ?? '{}')).toEqual({ tab: 'details' });
        // The memory-only fallback store must stay silent.
        expect(warn).not.toHaveBeenCalled();
    });

    it('user scope still throws without a LightdashProvider', async () => {
        const { useAppState } = await import('./appState');
        const error = vi
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);
        await expect(
            mount(null, () => {
                const [value, set, meta] = useAppState('period', 'x');
                return { value, set, meta };
            }),
        ).rejects.toThrow(/LightdashProvider/);
        error.mockRestore();
    });
});
