import { describe, expect, it } from 'vitest';
import {
    buildDataAppTemplateManifest,
    DataAppTemplatePackageError,
    getDataAppTemplateKind,
    parseDataAppTemplateManifest,
    validateDataAppTemplateEntryPath,
} from './templatePackage';

const validManifest = {
    templateVersion: 1,
    template: {
        id: 'forecaster',
        name: 'Forecaster',
        description: 'A live what-if forecast.',
        category: 'Forecasting',
    },
    questions: [
        { key: 'metric', label: 'What should we forecast?', required: true },
        { key: 'tiles', label: 'Which metrics?', kind: 'list' },
    ],
    bindings: { history: { explore: 'orders' } },
};

describe('validateDataAppTemplateEntryPath', () => {
    it('accepts authored src files and the guardrails file', () => {
        expect(validateDataAppTemplateEntryPath('src/App.jsx')).toBe(
            'src/App.jsx',
        );
        expect(validateDataAppTemplateEntryPath('./src/template.json')).toBe(
            'src/template.json',
        );
        expect(validateDataAppTemplateEntryPath('AGENTS.md')).toBe('AGENTS.md');
    });

    it('rejects scaffold, tooling, traversal and absolute paths', () => {
        for (const bad of [
            'package.json',
            'lightdash-app.yml',
            'dist/index.html',
            '.claude/skills/x.md',
            'src/../package.json',
            '/src/App.jsx',
            'src/node_modules/x.js',
            'src//App.jsx',
        ]) {
            expect(() => validateDataAppTemplateEntryPath(bad)).toThrow();
        }
    });
});

describe('parseDataAppTemplateManifest', () => {
    it('extracts identity and questions, ignoring the rest', () => {
        const parsed = parseDataAppTemplateManifest(
            JSON.stringify(validManifest),
        );
        expect(parsed.template.id).toBe('forecaster');
        expect(parsed.template.name).toBe('Forecaster');
        expect(parsed.questions).toHaveLength(2);
        expect(parsed.questions?.[1].kind).toBe('list');
        expect(parsed.questions?.[0].required).toBe(true);
    });

    it('defaults questions to an empty list', () => {
        const parsed = parseDataAppTemplateManifest(
            JSON.stringify({ ...validManifest, questions: undefined }),
        );
        expect(parsed.questions).toEqual([]);
    });

    it('rejects bad versions, ids, missing fields, and duplicate question keys', () => {
        expect(() =>
            parseDataAppTemplateManifest(
                JSON.stringify({ ...validManifest, templateVersion: 2 }),
            ),
        ).toThrow(/templateVersion/);
        expect(() =>
            parseDataAppTemplateManifest(
                JSON.stringify({
                    ...validManifest,
                    template: { ...validManifest.template, id: 'Not A Slug' },
                }),
            ),
        ).toThrow(/slug/);
        expect(() =>
            parseDataAppTemplateManifest(
                JSON.stringify({
                    ...validManifest,
                    template: { ...validManifest.template, description: '' },
                }),
            ),
        ).toThrow(/description/);
        expect(() =>
            parseDataAppTemplateManifest(
                JSON.stringify({
                    ...validManifest,
                    questions: [
                        { key: 'a', label: 'A' },
                        { key: 'a', label: 'B' },
                    ],
                }),
            ),
        ).toThrow(/duplicate/);
        expect(() => parseDataAppTemplateManifest('{')).toThrow(/valid JSON/);
    });

    describe('buildDataAppTemplateManifest', () => {
        it("keeps an existing manifest's bindings and lets the request own metadata and questions", () => {
            const existing = JSON.stringify({
                templateVersion: 1,
                template: {
                    id: 'old',
                    name: 'Old',
                    description: 'Old',
                    category: 'Old',
                },
                questions: [{ key: 'old', label: 'Old?' }],
                bindings: { history: { explore: 'orders' } },
                parameters: { horizon: { months: 24 } },
            });
            const merged = JSON.parse(
                buildDataAppTemplateManifest({
                    existing,
                    template: {
                        id: 'revenue-forecaster',
                        name: 'Revenue Forecaster',
                        description: 'Forecasts revenue.',
                        category: 'Forecasting',
                    },
                    questions: [
                        { key: 'metric', label: 'What should we forecast?' },
                    ],
                }),
            );
            expect(merged.bindings).toEqual({ history: { explore: 'orders' } });
            expect(merged.parameters).toEqual({ horizon: { months: 24 } });
            expect(merged.template.id).toBe('revenue-forecaster');
            expect(merged.questions).toEqual([
                { key: 'metric', label: 'What should we forecast?' },
            ]);
            expect(merged.templateVersion).toBe(1);
        });

        it('starts a fresh manifest when the app has none', () => {
            const built = JSON.parse(
                buildDataAppTemplateManifest({
                    existing: undefined,
                    template: {
                        id: 'plain',
                        name: 'Plain',
                        description: 'd',
                        category: 'c',
                    },
                    questions: [],
                }),
            );
            expect(built).toEqual({
                templateVersion: 1,
                template: {
                    id: 'plain',
                    name: 'Plain',
                    description: 'd',
                    category: 'c',
                },
                questions: [],
            });
        });

        it('rejects an existing manifest that is not valid JSON', () => {
            expect(() =>
                buildDataAppTemplateManifest({
                    existing: '{not json',
                    template: {
                        id: 'x',
                        name: 'x',
                        description: 'x',
                        category: 'x',
                    },
                    questions: [],
                }),
            ).toThrow(DataAppTemplatePackageError);
        });
    });

    describe('getDataAppTemplateKind', () => {
        it('is seeded when the package carries source beyond the manifest', () => {
            expect(
                getDataAppTemplateKind([
                    'src/template.json',
                    'src/App.jsx',
                    'AGENTS.md',
                ]),
            ).toBe('seeded');
        });

        it('is instructions-only when only the manifest and AGENTS.md travel', () => {
            expect(
                getDataAppTemplateKind(['src/template.json', 'AGENTS.md']),
            ).toBe('instructions');
        });
    });
});
