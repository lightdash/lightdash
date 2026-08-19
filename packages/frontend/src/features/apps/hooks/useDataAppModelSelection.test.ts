import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAiOrganizationSettings } from '../../../ee/features/aiCopilot/hooks/useAiOrganizationSettings';
import { renderHookWithProviders } from '../../../testing/testUtils';
import { useDataAppModelSelection } from './useDataAppModelSelection';

vi.mock(
    '../../../ee/features/aiCopilot/hooks/useAiOrganizationSettings',
    () => ({
        useAiOrganizationSettings: vi.fn(),
    }),
);

const setVisibleModels = (
    visibleDataAppModels: string[] | undefined,
    isLoading = false,
    dataAppCodingAgent: 'claude' | 'codex' = 'claude',
) =>
    vi.mocked(useAiOrganizationSettings).mockReturnValue({
        data: visibleDataAppModels
            ? { visibleDataAppModels, dataAppCodingAgent }
            : undefined,
        isLoading,
    } as unknown as ReturnType<typeof useAiOrganizationSettings>);

const setup = (
    props: {
        appUuid: string | null;
        latestVersionModel:
            | 'opus'
            | 'sonnet'
            | 'haiku'
            | 'gpt-5.6-sol'
            | 'gpt-5.6-terra'
            | 'gpt-5.6-luna'
            | null;
    } = { appUuid: 'viz-1', latestVersionModel: null },
) =>
    renderHookWithProviders(useDataAppModelSelection, undefined, {
        initialProps: props,
    });

describe('useDataAppModelSelection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setVisibleModels(['opus', 'sonnet', 'haiku']);
    });

    it('defaults to the org-visible default', () => {
        const { result } = setup();

        expect(result.current.selectedModel).toBe('sonnet');
        expect(result.current.codingAgent).toBe('claude');
    });

    it('offers the Codex models and defaults to Terra', () => {
        setVisibleModels(['opus', 'sonnet', 'haiku'], false, 'codex');
        const { result } = setup();

        expect(result.current.codingAgent).toBe('codex');
        expect(result.current.selectedModel).toBe('gpt-5.6-terra');
        expect(result.current.visibleModels).toEqual([
            'gpt-5.6-sol',
            'gpt-5.6-terra',
            'gpt-5.6-luna',
        ]);
        expect(result.current.modelRequest).toEqual({
            codexModel: 'gpt-5.6-terra',
        });
    });

    it('lets Codex users select Sol', () => {
        setVisibleModels(['opus', 'sonnet', 'haiku'], false, 'codex');
        const { result } = setup();

        act(() => result.current.setModel('gpt-5.6-sol'));

        expect(result.current.selectedModel).toBe('gpt-5.6-sol');
        expect(result.current.modelRequest).toEqual({
            codexModel: 'gpt-5.6-sol',
        });
    });

    it('pre-selects the model the latest version was built with', () => {
        const { result } = setup({
            appUuid: 'viz-1',
            latestVersionModel: 'opus',
        });

        expect(result.current.selectedModel).toBe('opus');
    });

    it('lets an explicit pick win over the latest version', () => {
        const { result } = setup({
            appUuid: 'viz-1',
            latestVersionModel: 'opus',
        });

        act(() => result.current.setModel('haiku'));

        expect(result.current.selectedModel).toBe('haiku');
    });

    it('keeps a pick made before the app existed', () => {
        const { result, rerender } = setup({
            appUuid: null,
            latestVersionModel: null,
        });

        act(() => result.current.setModel('opus'));
        rerender({ appUuid: 'viz-1', latestVersionModel: null });

        expect(result.current.selectedModel).toBe('opus');
    });

    it('drops a pick that belongs to another chart type', () => {
        const { result, rerender } = setup({
            appUuid: 'viz-1',
            latestVersionModel: null,
        });

        act(() => result.current.setModel('opus'));
        rerender({ appUuid: 'viz-2', latestVersionModel: null });

        expect(result.current.selectedModel).toBe('sonnet');
    });

    // A pre-app pick matches any uuid by design, so a surface that stays
    // mounted across chart types has to clear it on navigation or the pick
    // outlives the chart type it was made for.
    it('clears a pre-app pick so the next chart type derives its own', () => {
        const { result, rerender } = setup({
            appUuid: null,
            latestVersionModel: null,
        });

        act(() => result.current.setModel('opus'));
        rerender({ appUuid: 'viz-1', latestVersionModel: null });
        expect(result.current.selectedModel).toBe('opus');

        act(() => result.current.clearPick());
        rerender({ appUuid: 'viz-2', latestVersionModel: 'haiku' });

        expect(result.current.selectedModel).toBe('haiku');
    });

    it('never resurrects a model the admin has hidden', () => {
        setVisibleModels(['sonnet', 'haiku']);
        const { result } = setup({
            appUuid: 'viz-1',
            latestVersionModel: 'opus',
        });

        expect(result.current.selectedModel).toBe('sonnet');
        expect(result.current.visibleModels).toEqual(['sonnet', 'haiku']);
    });
});
