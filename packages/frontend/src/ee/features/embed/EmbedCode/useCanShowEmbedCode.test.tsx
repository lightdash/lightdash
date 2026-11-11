import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProject } from '../../../../hooks/useProject';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../../providers/App/useApp';
import { useCanShowEmbedCode } from './useCanShowEmbedCode';

vi.mock('../../../../hooks/useProject', () => ({ useProject: vi.fn() }));
vi.mock('../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
}));
vi.mock('../../../../providers/App/useApp', () => ({ default: vi.fn() }));

const can = vi.fn();

beforeEach(() => {
    vi.clearAllMocks();
    can.mockReturnValue(true);
    vi.mocked(useProject).mockReturnValue({
        data: {
            projectUuid: 'project-uuid',
            organizationUuid: 'organization-uuid',
        },
    } as ReturnType<typeof useProject>);
    vi.mocked(useServerFeatureFlag).mockReturnValue({
        data: { enabled: true },
    } as ReturnType<typeof useServerFeatureFlag>);
    vi.mocked(useApp).mockReturnValue({
        user: { data: { ability: { can } } },
    } as unknown as ReturnType<typeof useApp>);
});

describe('useCanShowEmbedCode', () => {
    it('allows project managers when embedding is enabled', () => {
        const { result } = renderHook(() =>
            useCanShowEmbedCode('project-uuid'),
        );

        expect(result.current).toBe(true);
        expect(can).toHaveBeenCalledWith(
            'update',
            expect.objectContaining({
                organizationUuid: 'organization-uuid',
                projectUuid: 'project-uuid',
            }),
        );
    });

    it('hides the action when embedding is disabled', () => {
        vi.mocked(useServerFeatureFlag).mockReturnValue({
            data: { enabled: false },
        } as ReturnType<typeof useServerFeatureFlag>);

        const { result } = renderHook(() =>
            useCanShowEmbedCode('project-uuid'),
        );

        expect(result.current).toBe(false);
    });

    it('hides the action without project update permission', () => {
        can.mockReturnValue(false);

        const { result } = renderHook(() =>
            useCanShowEmbedCode('project-uuid'),
        );

        expect(result.current).toBe(false);
    });
});
