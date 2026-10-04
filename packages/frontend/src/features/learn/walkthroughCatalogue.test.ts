import { ProjectMemberRole } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { SCOPE_TOURS } from '../scopeTours/generated';
import { tourUrlInCopy } from '../scopeTours/trainingCopy';
import {
    buildLearnCatalogue,
    DEVELOPER,
    DOCS_LESSON_SCOPE,
    focusModules,
    holds,
    isComplete,
    sortForLearner,
} from './catalogue';
import { SANDBOX_LESSONS } from './sandboxLessons';
describe('walkthrough catalogue', () => {
    it.each(['view:ContentAsCode', 'create:ContentAsCode'])(
        'teaches %s as a Developer lesson in the workspace',
        (scope) => {
            expect(
                buildLearnCatalogue().find((module) => module.scope === scope),
            ).toMatchObject({
                kind: 'scope',
                available: true,
                group: DEVELOPER,
                gate: 'contentAsCode',
            });
            expect(tourUrlInCopy('copy', scope, 'learn')).toMatch(
                /^\/projects\/copy\/learn\/workspace\?/,
            );
        },
    );

    it('lays out the Developer shelf as the docs do: the semantic layer, then content as code', () => {
        const developer = buildLearnCatalogue().filter(
            (module) => module.group === DEVELOPER,
        );
        // A learner who holds every lesson, so only the teaching order sorts.
        const held = new Set([
            DOCS_LESSON_SCOPE,
            ...developer.map((module) => module.scope),
        ]);
        expect(
            sortForLearner(held, developer).map((module) => module.title),
        ).toEqual([
            'Metrics',
            'Dimensions',
            'Download a chart as code',
            // Runs the download the lesson before it teaches.
            'Change a chart in code and upload it',
            // Still to come, kept with its siblings.
            'Download and upload any content as code',
        ]);
    });

    it('shows every card a blurb in plain text, with no markdown left in it', () => {
        const marked = buildLearnCatalogue().filter((module) =>
            /\]\(|\*\*/.test(module.blurb),
        );
        expect(marked.map((module) => module.scope)).toEqual([]);
        expect(
            buildLearnCatalogue().find(
                (module) => module.scope === 'create:ContentAsCode',
            )?.blurb,
        ).toMatch(
            /^From the Lightdash CLI, you can use the command lightdash upload/,
        );
    });

    it.each([
        'manage:VerifiedContent',
        'manage:ChangeCsvResults',
        'view:SpotlightTableConfig',
        'manage:SpotlightTableConfig',
        'manage:VirtualView',
        'delete:VirtualView',
        'manage:AiAgentDocument',
    ])('starts %s as a hands-on walkthrough, not reading', (scope) => {
        expect(
            buildLearnCatalogue().find((module) => module.scope === scope),
        ).toMatchObject({
            available: true,
        });
    });

    it.each([
        'view:Analytics',
        'view:AiAgentSkill',
        'manage:AiAgentSkill',
        'manage:ContentAsCode',
        'promote:SavedChart',
        'promote:Dashboard',
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
        'view:EmbedAiAgentDebug',
        'view:EmbedCompiledSql',
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
    // One lesson teaches both scopes with the same controls, so the library
    // shows it once: under the scope it was declared on, standing for both,
    // labelled with the lowest role that holds either, and held by a
    // learner who holds either.
    it.each([
        ['manage:ContentVerification', 'view:ContentVerification'],
        ['manage:SqlRunner', 'manage:CustomSql'],
        ['manage:AiAgentDocument', 'view:AiAgentDocument'],
    ])('shows the lesson for %s once, covering %s', (primary, covered) => {
        const modules = buildLearnCatalogue();
        expect(modules.find((m) => m.scope === covered)).toBeUndefined();
        const card = modules.find((m) => m.scope === primary)!;
        expect(card).toMatchObject({
            available: true,
            scopes: [primary, covered],
        });
        expect(holds(new Set([covered]), card)).toBe(true);
        expect(holds(new Set(['view:Dashboard']), card)).toBe(false);
        expect(isComplete([covered], card)).toBe(true);
        expect(isComplete([primary], card)).toBe(true);
        expect(isComplete(['view:Dashboard'], card)).toBe(false);
    });

    it('labels a covering lesson with the lowest role that holds any of its scopes', () => {
        const card = buildLearnCatalogue().find(
            (m) => m.scope === 'manage:ContentVerification',
        )!;
        // view:ContentVerification is held from Interactive viewer; the
        // manage scope alone would say Developer.
        expect(card.minRole).toBe(ProjectMemberRole.INTERACTIVE_VIEWER);
    });

    it('offers only walkthroughs as available scope modules', () => {
        const modules = buildLearnCatalogue();
        const scopes = modules.filter((m) => m.kind === 'scope');
        // 48 walkthroughs, three of them copies of a lesson shown once.
        expect(scopes.filter((m) => m.available)).toHaveLength(45);
        expect(scopes.filter((m) => !m.available)).toHaveLength(21);
        expect(modules.filter((m) => m.kind === 'docs')).toHaveLength(
            SANDBOX_LESSONS.length,
        );
        expect(
            modules.every(
                (m) => !m.available || SCOPE_TOURS[m.scope] !== undefined,
            ),
        ).toBe(true);
    });
});
