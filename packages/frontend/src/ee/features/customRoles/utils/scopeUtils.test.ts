import { describe, expect, it } from 'vitest';
import {
    filterScopesByDependencyStatus,
    getScopeDependencyStatus,
    getScopeDependencyStatusCounts,
    getScopeDependencies,
    getScopeNamesWithDependencies,
    getScopesByGroup,
} from './scopeUtils';

describe('getScopeDependencies', () => {
    it('returns direct and indirect scope dependencies with descriptions once', () => {
        expect(getScopeDependencies('manage:Dashboard')).toEqual([
            {
                name: 'view:Project',
                description: 'View project details',
            },
            {
                name: 'view:SavedChart',
                description: 'Load chart tiles while editing dashboards',
            },
            {
                name: 'view:Space',
                description: 'Create a dashboard without picking a space',
            },
        ]);
    });

    it('returns an empty list when a scope has no dependencies', () => {
        expect(getScopeDependencies('view:Project')).toEqual([]);
    });
});

describe('getScopeNamesWithDependencies', () => {
    it('returns the selected scope and its direct and indirect dependencies once', () => {
        expect(getScopeNamesWithDependencies('manage:Dashboard')).toEqual([
            'manage:Dashboard',
            'view:Project',
            'view:SavedChart',
            'view:Space',
        ]);
    });
});

describe('getScopeDependencyStatus', () => {
    it('classifies scopes with all dependencies selected as full', () => {
        expect(
            getScopeDependencyStatus('manage:Dashboard', {
                'view:Project': true,
                'view:SavedChart': true,
                'view:Space': true,
            }),
        ).toBe('full');
    });

    it('classifies scopes with some dependencies selected as partial', () => {
        expect(
            getScopeDependencyStatus('manage:Dashboard', {
                'view:Project': true,
            }),
        ).toBe('partial');
    });

    it('classifies scopes with no dependencies selected as empty', () => {
        expect(getScopeDependencyStatus('manage:Dashboard', {})).toBe('empty');
    });

    it('classifies scopes without dependencies as full', () => {
        expect(getScopeDependencyStatus('view:Project', {})).toBe('full');
    });
});

describe('filterScopesByDependencyStatus', () => {
    const groupedScopes = getScopesByGroup(true, 'project');

    it('returns only selected scopes matching the requested status', () => {
        const filtered = filterScopesByDependencyStatus(
            groupedScopes,
            {
                'manage:Dashboard': true,
                'create:Job': true,
                'view:Project': true,
            },
            'partial',
        );

        expect(
            filtered.flatMap((group) => group.scopes.map(({ name }) => name)),
        ).toEqual(['manage:Dashboard', 'create:Job']);
    });

    it('drops groups without a matching scope', () => {
        expect(
            filterScopesByDependencyStatus(
                groupedScopes,
                { 'view:Project': true },
                'empty',
            ),
        ).toEqual([]);
    });

    it('returns the existing groups when no status is requested', () => {
        expect(
            filterScopesByDependencyStatus(groupedScopes, {
                'view:Project': true,
            }),
        ).toBe(groupedScopes);
    });
});

describe('getScopeDependencyStatusCounts', () => {
    it('counts selected scopes with all dependencies selected as full', () => {
        expect(
            getScopeDependencyStatusCounts({
                level: 'project',
                scopes: {
                    'create:Job': true,
                    'view:Project': true,
                    'manage:CompileProject': true,
                    'manage:SqlRunner': true,
                },
            }),
        ).toEqual({
            full: 4,
            partial: 0,
            empty: 0,
        });
    });

    it('counts selected scopes with no dependencies as full', () => {
        expect(
            getScopeDependencyStatusCounts({
                level: 'project',
                scopes: {
                    'view:Project': true,
                },
            }),
        ).toEqual({
            full: 1,
            partial: 0,
            empty: 0,
        });
    });

    it('counts selected scopes with some or no dependencies selected separately', () => {
        expect(
            getScopeDependencyStatusCounts({
                level: 'project',
                scopes: {
                    'create:Job': true,
                    'manage:Dashboard': true,
                    'view:Project': true,
                },
            }),
        ).toEqual({
            full: 1,
            partial: 2,
            empty: 0,
        });
    });
});
