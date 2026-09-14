import { Ability } from '@casl/ability';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRecentlyDeletedAccess } from './useRecentlyDeletedAccess';

const state = vi.hoisted(() => ({
    enabled: true,
    rules: [] as {
        action: string;
        subject: string;
        conditions?: { organizationUuid: string; projectUuid: string };
    }[],
}));
vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({
        health: { data: { softDelete: { enabled: state.enabled } } },
        user: {
            data: {
                organizationUuid: 'org',
                ability: new Ability(state.rules),
            },
        },
    }),
}));

describe('project access to recently deleted content', () => {
    beforeEach(() => {
        state.enabled = true;
        state.rules = [
            {
                action: 'manage',
                subject: 'DeletedContent',
                conditions: { organizationUuid: 'org', projectUuid: 'copy' },
            },
        ];
    });
    it('allows restoration without project-settings permission', () => {
        expect(
            renderHook(() => useRecentlyDeletedAccess('copy')).result.current,
        ).toBe(true);
    });
    it('does not expose another project through a copied route', () => {
        expect(
            renderHook(() => useRecentlyDeletedAccess('real-project')).result
                .current,
        ).toBe(false);
    });
    it('requires the deleted-content permission', () => {
        state.rules = [{ action: 'view', subject: 'Project' }];
        expect(
            renderHook(() => useRecentlyDeletedAccess('copy')).result.current,
        ).toBe(false);
    });
    it('does not expose a disabled product feature', () => {
        state.enabled = false;
        expect(
            renderHook(() => useRecentlyDeletedAccess('copy')).result.current,
        ).toBe(false);
    });
});
