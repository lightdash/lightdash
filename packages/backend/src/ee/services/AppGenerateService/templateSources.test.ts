import { describe, expect, it } from 'vitest';
import {
    buildOrgTemplateInstructions,
    orgTemplateBuildFixNote,
    orgTemplateEditScope,
    shouldSeedOrgTemplate,
} from './templateSources';

describe('template sources', () => {
    describe('organization templates', () => {
        it('seeds the first build of a seeded template, resumed sandbox or not', () => {
            // The catalog stage only runs while generation has not started,
            // so re-extracting the tar on a retried first build is safe and
            // the only way a crash before seeding still produces a seeded app.
            expect(shouldSeedOrgTemplate({ version: 1, kind: 'seeded' })).toBe(
                true,
            );
            expect(shouldSeedOrgTemplate({ version: 2, kind: 'seeded' })).toBe(
                false,
            );
            expect(
                shouldSeedOrgTemplate({ version: 1, kind: 'instructions' }),
            ).toBe(false);
        });

        it('locks the manifest for seeded-template apps from the kind pinned on the app', () => {
            expect(orgTemplateEditScope('seeded')).toBe('manifest');
            expect(orgTemplateEditScope('instructions')).toBe('source');
            expect(orgTemplateEditScope(null)).toBe('source');
        });

        it('tells a manifest-scoped fixer what it can and cannot repair', () => {
            expect(orgTemplateBuildFixNote('source')).toBe('');
            const note = orgTemplateBuildFixNote('manifest');
            expect(note).toContain('src/template.json');
            expect(note).toMatch(/template/i);
        });

        it('softens the read-only claim when the agent cannot be held to it', () => {
            const enforced = buildOrgTemplateInstructions({
                name: 'Metric Forecaster',
                guardrails: null,
                seeded: true,
                enforced: true,
            });
            expect(enforced).toContain('the only file you can write');
            const unenforced = buildOrgTemplateInstructions({
                name: 'Metric Forecaster',
                guardrails: null,
                seeded: true,
                enforced: false,
            });
            expect(unenforced).not.toContain('the only file you can write');
            expect(unenforced).toContain('src/template.json');
            expect(unenforced).toMatch(/only edit|edit only/i);
        });

        it('binds a seeded org template and carries its guardrails verbatim', () => {
            const instructions = buildOrgTemplateInstructions({
                name: 'Metric Forecaster',
                guardrails: '# Guardrails\nNever re-grain the forecast.',
                seeded: true,
            });
            expect(instructions).toContain('Metric Forecaster');
            expect(instructions).toContain('src/template.json');
            expect(instructions).toContain('Never re-grain the forecast.');
            expect(instructions).toMatch(/BIND/);
        });

        it('keeps the guardrails on iterations without re-seeding language', () => {
            const instructions = buildOrgTemplateInstructions({
                name: 'Metric Forecaster',
                guardrails: 'Keep the methodology.',
                seeded: false,
            });
            expect(instructions).toContain('Keep the methodology.');
            expect(instructions).not.toMatch(/already contains the finished/);
        });

        it('omits the guardrails section when the package has none', () => {
            const instructions = buildOrgTemplateInstructions({
                name: 'Plain',
                guardrails: null,
                seeded: true,
            });
            expect(instructions).toContain('Plain');
            expect(instructions).not.toContain('Template guardrails');
        });

        it('turns an instructions-only template into the build prompt, on first build and on iteration', () => {
            const first = buildOrgTemplateInstructions({
                name: 'Executive Summary',
                guardrails: 'One page. Three KPIs. A short narrative.',
                seeded: false,
                kind: 'instructions',
            });
            expect(first).toContain('Executive Summary');
            expect(first).toContain('One page. Three KPIs.');
            expect(first).not.toMatch(/src\/template\.json/);
            expect(first).toMatch(/generate|build/i);
            const later = buildOrgTemplateInstructions({
                name: 'Executive Summary',
                guardrails: 'One page. Three KPIs. A short narrative.',
                seeded: false,
                kind: 'instructions',
                iteration: true,
            });
            expect(later).toContain('One page. Three KPIs.');
            expect(later).not.toMatch(/src\/template\.json/);
        });
    });
});
