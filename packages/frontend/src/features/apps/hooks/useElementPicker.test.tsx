import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useElementPicker } from './useElementPicker';

const renderPicker = (identityKey = 'app:1', onEnabled?: () => void) =>
    renderHook(({ key }) => useElementPicker({ identityKey: key, onEnabled }), {
        initialProps: { key: identityKey },
    });

const h1Label = '[h1 "Revenue" @src/App.jsx:14]';

describe('useElementPicker', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('is unavailable until the served bundle announces the picker', () => {
        const { result } = renderPicker();
        expect(result.current.available).toBe(false);

        act(() =>
            result.current.iframeProps.onInspectorAvailabilityChange(true),
        );

        expect(result.current.available).toBe(true);
    });

    it('turns on from the toggle and tells the host so lineage can be switched off', () => {
        const onEnabled = vi.fn();
        const { result } = renderPicker('app:1', onEnabled);

        act(() => result.current.toggle());
        expect(result.current.enabled).toBe(true);
        expect(result.current.iframeProps.inspectorEnabled).toBe(true);
        expect(onEnabled).toHaveBeenCalledTimes(1);

        act(() => result.current.toggle());
        expect(result.current.enabled).toBe(false);
        expect(onEnabled).toHaveBeenCalledTimes(1);
    });

    it('collects one reference per picked element, collapsing repeat clicks', () => {
        const { result } = renderPicker();

        act(() =>
            result.current.iframeProps.onElementSelected({ label: h1Label }),
        );
        act(() =>
            result.current.iframeProps.onElementSelected({ label: h1Label }),
        );
        act(() =>
            result.current.iframeProps.onElementSelected({
                label: '[button "Send"]',
            }),
        );

        expect(result.current.refs).toEqual([
            { tag: 'h1', text: 'Revenue', loc: 'src/App.jsx:14' },
            { tag: 'button', text: 'Send', loc: '' },
        ]);
    });

    it('caps chart-type references and accepts another after removal', () => {
        const { result } = renderHook(() =>
            useElementPicker({ identityKey: 'chart:1', maxRefs: 2 }),
        );

        act(() => result.current.select({ label: '[button "First"]' }));
        act(() => result.current.select({ label: '[button "Second"]' }));
        act(() => result.current.select({ label: '[button "Third"]' }));
        expect(result.current.refs.map((ref) => ref.text)).toEqual([
            'First',
            'Second',
        ]);

        act(() => result.current.remove(result.current.refs[0]));
        act(() => result.current.select({ label: '[button "Third"]' }));
        expect(result.current.refs.map((ref) => ref.text)).toEqual([
            'Second',
            'Third',
        ]);
    });

    it('warns and ignores a label it does not recognise', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { result } = renderPicker();

        act(() => result.current.select({ label: 'not a reference' }));

        expect(result.current.refs).toEqual([]);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('element picker label'),
            'not a reference',
        );
    });

    it('hands picked references to onPick instead of keeping them', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const onPick = vi.fn();
        const { result } = renderHook(() =>
            useElementPicker({ identityKey: 'app:1', onPick }),
        );

        act(() => result.current.select({ label: h1Label }));
        act(() => result.current.select({ label: 'not a reference' }));

        expect(onPick).toHaveBeenCalledTimes(1);
        expect(onPick).toHaveBeenCalledWith({
            tag: 'h1',
            text: 'Revenue',
            loc: 'src/App.jsx:14',
        });
        expect(result.current.refs).toEqual([]);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('removes a single reference', () => {
        const { result } = renderPicker();
        act(() => result.current.select({ label: h1Label }));
        act(() => result.current.select({ label: '[button "Send"]' }));

        act(() =>
            result.current.remove({
                tag: 'h1',
                text: 'Revenue',
                loc: 'src/App.jsx:14',
            }),
        );

        expect(result.current.refs).toEqual([
            { tag: 'button', text: 'Send', loc: '' },
        ]);
    });

    it('leaves picker mode on Esc but keeps what was picked', () => {
        const { result } = renderPicker();
        act(() => result.current.toggle());
        act(() => result.current.select({ label: h1Label }));

        act(() => result.current.iframeProps.onInspectorCancelled());

        expect(result.current.enabled).toBe(false);
        expect(result.current.refs).toHaveLength(1);
    });

    it('clears every reference without touching picker mode', () => {
        const { result } = renderPicker();
        act(() => result.current.toggle());
        act(() => result.current.select({ label: h1Label }));

        act(() => result.current.clear());

        expect(result.current.refs).toEqual([]);
        expect(result.current.enabled).toBe(true);
    });

    it('forgets availability and leaves picker mode when a new bundle lands', () => {
        const { result, rerender } = renderPicker('app:1');
        act(() =>
            result.current.iframeProps.onInspectorAvailabilityChange(true),
        );
        act(() => result.current.toggle());
        act(() => result.current.select({ label: h1Label }));

        rerender({ key: 'app:2' });

        expect(result.current.available).toBe(false);
        expect(result.current.enabled).toBe(false);
        expect(result.current.refs).toHaveLength(1);
    });

    it('retains version references but clears them when the chart type changes', () => {
        const { result, rerender } = renderHook(
            ({ appUuid, version }) =>
                useElementPicker({
                    identityKey: `${appUuid}:${version}`,
                    refsIdentityKey: appUuid,
                }),
            { initialProps: { appUuid: 'chart-a', version: 1 } },
        );
        act(() => result.current.select({ label: h1Label }));

        rerender({ appUuid: 'chart-a', version: 2 });
        expect(result.current.refs).toHaveLength(1);

        rerender({ appUuid: 'chart-b', version: 1 });
        expect(result.current.refs).toEqual([]);
    });
});
