import { describe, expect, it } from 'vitest';
import { SCOPE_TOURS } from '../scopeTours/generated';
import { buildLearnCatalogue, focusModules } from './catalogue';
describe('walkthrough catalogue', () => {
    it('teaches Browse navigation for Recently deleted without a conflicting settings route', () => {
        const tour = SCOPE_TOURS['manage:DeletedContent'];
        expect(tour.steps.map((step) => step.body).join(' ')).not.toMatch(
            /project settings/i,
        );
        expect(tour.steps.map((step) => step.target)).toContain(
            '[data-tour-nav="recently-deleted"]',
        );
        expect(tour.steps.at(-1)?.body).toContain('original space');
    });

    it.each([
        'manage:DeletedContent',
        'manage:CustomSql',
        'view:ContentVerification',
        'manage:VerifiedContent',
        'manage:ChangeCsvResults',
        'view:SpotlightTableConfig',
        'manage:SpotlightTableConfig',
        'manage:VirtualView',
        'delete:VirtualView',
    ])('starts %s as a hands-on walkthrough, not reading', (scope) => {
        expect(
            buildLearnCatalogue().find((module) => module.scope === scope),
        ).toMatchObject({
            available: true,
            format: 'walkthrough',
        });
    });

    it.each([
        'view:Analytics',
        'view:AiAgentDocument',
        'manage:AiAgentDocument',
        'view:ContentAsCode',
        'create:ContentAsCode',
        'manage:ContentAsCode',
        'promote:SavedChart',
        'promote:Dashboard',
        'manage:Validation',
        'view:EmbedDashboardFilters',
        'view:EmbedDashboardFilterAddition',
        'view:EmbedDashboardParameters',
        'view:EmbedCsvExport',
        'view:EmbedImageExport',
        'view:EmbedPagePdfExport',
        'view:EmbedDashboardCsvExport',
        'view:EmbedDateZoom',
        'view:EmbedExplore',
        'view:EmbedUnderlyingData',
        'view:EmbedDataApps',
        'view:EmbedAiAgent',
    ])('keeps %s visible as coming soon', (scope) => {
        const module = buildLearnCatalogue().find((m) => m.scope === scope)!;
        expect(module).toMatchObject({
            available: false,
            format: 'coming-soon',
            stepCount: 0,
        });
        expect(focusModules(new Set(), [module], [], scope)).toEqual({
            resume: undefined,
            recommended: undefined,
        });
    });
    it('offers only walkthroughs as available modules', () => {
        const modules = buildLearnCatalogue();
        expect(modules.filter((m) => m.available)).toHaveLength(42);
        expect(modules.filter((m) => !m.available)).toHaveLength(21);
        expect(
            modules.every((m) => !m.available || m.format === 'walkthrough'),
        ).toBe(true);
    });
});
