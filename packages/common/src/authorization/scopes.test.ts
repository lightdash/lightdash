import {
    getScopeAncestors,
    getScopeDescendants,
    getScopes,
    getScopeSubstitutes,
    getUnsatisfiedScopeDependencies,
} from './scopes';

describe('scope dependency graph helpers', () => {
    it('declares the Deep Research core and conditional dependencies', () => {
        const scope = getScopes({ isEnterprise: true }).find(
            ({ name }) => name === 'create:AiDeepResearch',
        );

        expect(scope?.dependencies).toEqual([
            { name: 'view:Project' },
            {
                name: 'manage:Explore',
                description: 'When querying project data',
            },
            {
                name: 'view:Space',
                description: 'When discovering or reading saved content',
            },
            {
                name: 'view:Dashboard',
                description: 'When discovering or reading dashboards',
            },
            {
                name: 'view:SavedChart',
                description: 'When discovering or reading saved charts',
            },
            {
                name: 'view:ContentAsCode',
                description: 'When reading saved content definitions',
            },
            {
                name: 'manage:ContentVerification',
                description: 'When listing verified content',
            },
        ]);
    });

    describe('getScopeAncestors', () => {
        it('returns direct and transitive dependencies for a scope', () => {
            expect(getScopeAncestors('manage:Dashboard')).toEqual([
                'view:Project',
                'view:SavedChart',
                'view:Space',
            ]);
        });

        it('ignores unknown scopes', () => {
            expect(getScopeAncestors('not:aScope')).toEqual([]);
            expect(getScopeAncestors('not-a-scope')).toEqual([]);
        });

        it('normalizes scope names before traversing dependencies', () => {
            expect(getScopeAncestors('manage:dashboard')).toEqual([
                'view:Project',
                'view:SavedChart',
                'view:Space',
            ]);
        });

        it('does not return the input scope when the graph cycles back to it', () => {
            const ancestors = getScopeAncestors('manage:CompileProject');

            expect(ancestors).toContain('create:Job');
            expect(ancestors).not.toContain('manage:CompileProject');
        });
    });

    describe('getScopeDescendants', () => {
        it('returns direct and transitive dependents for a scope', () => {
            const descendants = getScopeDescendants('view:SavedChart');

            expect(descendants).toEqual(
                expect.arrayContaining([
                    'view:Dashboard',
                    'manage:Dashboard',
                    'manage:Dashboard@space',
                    'manage:Dashboard@self',
                ]),
            );
            expect(descendants).not.toContain('view:SavedChart');
        });

        it('ignores unknown scopes', () => {
            expect(getScopeDescendants('not:aScope')).toEqual([]);
            expect(getScopeDescendants('not-a-scope')).toEqual([]);
        });

        it('does not return the input scope when the graph cycles back to it', () => {
            const descendants = getScopeDescendants('create:Job');

            expect(descendants).toContain('manage:CompileProject');
            expect(descendants).not.toContain('create:Job');
        });
    });

    it('can traverse ancestors for every scope without looping forever', () => {
        getScopes({ isEnterprise: true }).forEach((scope) => {
            expect(
                getScopeAncestors(scope.name, { isEnterprise: true }),
            ).not.toContain(scope.name);
        });
    });

    describe('getScopeSubstitutes', () => {
        it('returns stronger scope variations that can replace a view requirement', () => {
            expect(getScopeSubstitutes('view:Dashboard')).toEqual([
                'manage:Dashboard',
                'manage:Dashboard@space',
                'manage:Dashboard@self',
            ]);
        });

        it('does not treat promote as a substitute for view or manage', () => {
            expect(getScopeSubstitutes('view:Dashboard')).not.toContain(
                'promote:Dashboard',
            );
            expect(getScopeSubstitutes('manage:Dashboard@space')).not.toContain(
                'promote:Dashboard@space',
            );
        });

        it('returns broader same-action variants that can replace a scoped requirement', () => {
            expect(getScopeSubstitutes('manage:Dashboard@space')).toContain(
                'manage:Dashboard',
            );
            expect(
                getScopeSubstitutes('view:DataApp@self', {
                    isEnterprise: true,
                }),
            ).toContain('view:DataApp');
        });

        it('does not return weaker or narrower scopes as substitutes', () => {
            expect(getScopeSubstitutes('manage:Dashboard')).not.toContain(
                'view:Dashboard',
            );
            expect(getScopeSubstitutes('manage:Dashboard')).not.toContain(
                'manage:Dashboard@space',
            );
        });

        it('returns manage as a substitute for granular create and delete scopes', () => {
            expect(getScopeSubstitutes('create:VirtualView')).toEqual([
                'manage:VirtualView',
            ]);
            expect(getScopeSubstitutes('delete:VirtualView')).toEqual([
                'manage:VirtualView',
            ]);
        });

        it('returns stronger scoped variants for a scoped view requirement', () => {
            expect(
                getScopeSubstitutes('view:DataApp@self', {
                    isEnterprise: true,
                }),
            ).toContain('manage:DataApp@self');
        });

        it('ignores unknown scopes', () => {
            expect(getScopeSubstitutes('not:aScope')).toEqual([]);
            expect(getScopeSubstitutes('not-a-scope')).toEqual([]);
        });

        it('normalizes scope names before finding substitutes', () => {
            expect(getScopeSubstitutes('view:dashboard')).toEqual([
                'manage:Dashboard',
                'manage:Dashboard@space',
                'manage:Dashboard@self',
            ]);
        });
    });

    describe('getUnsatisfiedScopeDependencies', () => {
        it('returns missing dependencies for a new scope', () => {
            expect(
                getUnsatisfiedScopeDependencies(
                    ['view:Project', 'view:SavedChart'],
                    'manage:Dashboard',
                ),
            ).toEqual(['view:Space']);
        });

        it('treats substitute scopes as satisfying dependencies', () => {
            expect(
                getUnsatisfiedScopeDependencies(
                    ['view:Project', 'manage:SavedChart', 'view:Space'],
                    'manage:Dashboard',
                ),
            ).toEqual([]);
        });

        it('includes transitive dependencies', () => {
            expect(
                getUnsatisfiedScopeDependencies(
                    ['view:Project', 'manage:SavedChart@space'],
                    'manage:CustomFields',
                ),
            ).toEqual(['view:Space', 'manage:Explore']);
        });

        it('ignores unknown existing scopes and unknown new scopes', () => {
            expect(
                getUnsatisfiedScopeDependencies(
                    ['not:aScope', 'view:Project'],
                    'view:SavedChart',
                ),
            ).toEqual([]);
            expect(
                getUnsatisfiedScopeDependencies(['view:Project'], 'not:aScope'),
            ).toEqual([]);
            expect(
                getUnsatisfiedScopeDependencies(
                    ['not-a-scope', 'view:Project'],
                    'not-a-scope',
                ),
            ).toEqual([]);
        });

        it('normalizes existing and new scope names before checking dependencies', () => {
            expect(
                getUnsatisfiedScopeDependencies(
                    ['view:project', 'manage:saved_chart', 'view:space'],
                    'manage:dashboard',
                ),
            ).toEqual([]);
        });
    });
});
