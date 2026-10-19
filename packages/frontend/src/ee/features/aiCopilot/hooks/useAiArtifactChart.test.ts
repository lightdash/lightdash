import type * as LightdashCommon from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAiArtifactCompiledSql } from './useAiArtifactChart';

const { getMergeCompiledSqlTextSpy } = vi.hoisted(() => ({
    getMergeCompiledSqlTextSpy: vi.fn(),
}));

vi.mock('@lightdash/common', async (importOriginal) => {
    const actual = await importOriginal<typeof LightdashCommon>();
    getMergeCompiledSqlTextSpy.mockImplementation(
        actual.getMergeCompiledSqlText,
    );
    return { ...actual, getMergeCompiledSqlText: getMergeCompiledSqlTextSpy };
});

const mergeCompiledSql = {
    legs: [{ sourceId: 'orders', sql: 'SELECT 1', metricQuery: null }],
    sql: 'SELECT * FROM "merge_source_0"',
    errors: [],
};

vi.mock('./useCanViewAiAgentSql', () => ({ useCanViewAiAgentSql: () => true }));
vi.mock('../../../../hooks/useCompiledSql', () => ({
    useCompiledSqlFromMetricQuery: () => ({ data: undefined }),
}));
vi.mock('./useAiMergeCompiledSql', () => ({
    useAiMergeCompiledSql: () => ({ data: mergeCompiledSql }),
}));

describe('useAiArtifactCompiledSql', () => {
    it('builds the merged SQL text once across rerenders', () => {
        const { result, rerender } = renderHook(() =>
            useAiArtifactCompiledSql({
                projectUuid: 'project-1',
                isMergeArtifact: true,
                vizQueryData: undefined,
            }),
        );
        rerender();
        rerender();

        expect(result.current).toContain('-- Query A ("orders")');
        expect(getMergeCompiledSqlTextSpy).toHaveBeenCalledTimes(1);
    });
});
