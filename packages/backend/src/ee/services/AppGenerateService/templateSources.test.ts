import { describe, expect, it } from 'vitest';
import {
    buildOrgTemplateInstructions,
    shouldSeedOrgTemplate,
} from './templateSources';

describe('template sources', () => {
    describe('organization templates', () => {
        it('seeds only the first build of a fresh sandbox', () => {
            expect(
                shouldSeedOrgTemplate({ version: 1, wasResumed: false }),
            ).toBe(true);
            expect(
                shouldSeedOrgTemplate({ version: 2, wasResumed: false }),
            ).toBe(false);
            expect(
                shouldSeedOrgTemplate({ version: 1, wasResumed: true }),
            ).toBe(false);
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
    });
});
