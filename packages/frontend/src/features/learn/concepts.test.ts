import { getTrainingProjectScopes } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { buildLearnCatalogue, gateFor, holds, focusModules } from './catalogue';
import { CONCEPT_LESSONS } from './conceptLessons.generated';
describe('concept catalogue', () => {
    it('includes docs-based reading without granting excluded trainee permissions', () => {
        for (const scope of [
            'view:Analytics',
            'view:AiAgentDocument',
            'manage:AiAgentDocument',
        ]) {
            expect(getTrainingProjectScopes()).not.toContain(scope);
            expect(
                buildLearnCatalogue().find((m) => m.scope === scope),
            ).toMatchObject({ available: true, format: 'concept' });
        }
    });
    it('hides scopes without a lesson and distinguishes viewing from management', () => {
        expect(
            buildLearnCatalogue().find((m) => m.scope === 'view:Job'),
        ).toBeUndefined();
        const module = buildLearnCatalogue().find(
            (m) => m.scope === 'manage:VerifiedContent',
        )!;
        expect(holds(new Set(['view:ContentVerification']), module)).toBe(
            false,
        );
        expect(module.format).toBe('concept');
    });
    it('does not count concept acknowledgment as a completed walkthrough', () => {
        const concept = buildLearnCatalogue().find(
            (m) => m.scope === 'view:Analytics',
        )!;
        const tour = { ...concept, format: 'walkthrough' as const };
        const completed = ['concept:view:Analytics'];
        expect(
            focusModules(new Set(), [concept], completed, null).recommended,
        ).toBeUndefined();
        expect(
            focusModules(new Set(), [tour], completed, null).recommended,
        ).toEqual(tour);
    });

    it('gates agent document reading with agents and cites every concept', () => {
        expect(
            gateFor({ name: 'view:AiAgentDocument', isEnterprise: true }),
        ).toBe('aiAgents');
        Object.entries(CONCEPT_LESSONS).forEach(([scope, lesson]) => {
            expect(lesson.coveredScopes).toContain(scope);
            expect(lesson.sections.length).toBeGreaterThan(0);
            lesson.sections.forEach((section) => {
                expect(section.sourceUrl).toMatch(
                    /^https:\/\/docs.lightdash.com\//,
                );
                expect(section.sourceHash).toMatch(/^[a-f0-9]{64}$/);
            });
        });
    });
});
