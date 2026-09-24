import { describe, expect, it } from 'vitest';
import { SCOPE_TOURS } from '../scopeTours/generated';
import { buildLearnCatalogue, focusModules } from './catalogue';
describe('walkthrough catalogue', () => {
    it.each([
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
        });
    });

    it.each([
        'view:Analytics',
        'view:AiAgentDocument',
        'manage:AiAgentDocument',
        'view:AiAgentSkill',
        'manage:AiAgentSkill',
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
        'manage:DeletedContent',
    ])('keeps %s visible as coming soon', (scope) => {
        const module = buildLearnCatalogue().find((m) => m.scope === scope)!;
        expect(module).toMatchObject({
            available: false,
            stepCount: 0,
        });
        expect(focusModules(new Set(), [module], [], scope)).toEqual({
            resume: undefined,
            recommended: undefined,
        });
    });
    it('offers only walkthroughs as available modules', () => {
        const modules = buildLearnCatalogue();
        expect(modules.filter((m) => m.available)).toHaveLength(41);
        expect(modules.filter((m) => !m.available)).toHaveLength(26);
        expect(
            modules.every(
                (m) => !m.available || SCOPE_TOURS[m.scope] !== undefined,
            ),
        ).toBe(true);
    });
});
