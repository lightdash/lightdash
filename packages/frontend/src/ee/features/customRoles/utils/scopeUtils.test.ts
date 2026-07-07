import { describe, expect, it } from 'vitest';
import {
    getScopeDependencyStatusCounts,
    getScopeDependencies,
    getScopeNamesWithDependencies,
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
