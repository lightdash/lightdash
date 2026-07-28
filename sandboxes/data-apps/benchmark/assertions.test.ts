import assert from 'node:assert/strict';
import test from 'node:test';
import { parseVizDeclaration, vizDeclarationRules } from './assertions.ts';
import { renderRules, type RenderResult } from './renderGate.ts';
import { analyzeStream } from './stream.ts';

const validDeclaration = {
    fields: [
        {
            name: 'category',
            label: 'Category',
            type: 'dimension',
            required: true,
        },
        {
            name: 'value',
            label: 'Value',
            type: 'metric',
            required: true,
        },
    ],
    configOptions: [
        {
            name: 'showLabels',
            label: 'Show labels',
            type: 'boolean',
            default: true,
        },
        {
            name: 'maxBars',
            label: 'Maximum bars',
            type: 'number',
            default: 12,
        },
    ],
    colorPalette: { group: 'Appearance' },
};

test('valid viz structured output produces objective declaration rules', () => {
    const declaration = parseVizDeclaration(validDeclaration);
    assert.deepEqual(declaration, {
        fields: validDeclaration.fields,
        configOptions: [
            { name: 'showLabels', type: 'boolean', default: true },
            { name: 'maxBars', type: 'number', default: 12 },
        ],
        colorPalette: { group: 'Appearance' },
    });
    assert.deepEqual(vizDeclarationRules(declaration), {
        'emits-valid-viz-declaration': true,
        'declares-fields': true,
        'declares-config-options': true,
        'declares-color-palette': true,
    });
});

test('declaration rules report missing product capabilities separately', () => {
    const declaration = parseVizDeclaration({
        fields: [],
        configOptions: [],
        colorPalette: null,
    });
    assert.deepEqual(vizDeclarationRules(declaration), {
        'emits-valid-viz-declaration': true,
        'declares-fields': false,
        'declares-config-options': false,
        'declares-color-palette': false,
    });
    assert.deepEqual(vizDeclarationRules(null), {
        'emits-valid-viz-declaration': false,
        'declares-fields': false,
        'declares-config-options': false,
        'declares-color-palette': false,
    });
});

test('parseVizDeclaration rejects shapes the persisted contract rejects', () => {
    assert.equal(parseVizDeclaration(null), null);
    assert.equal(parseVizDeclaration('{}'), null);
    assert.equal(parseVizDeclaration({ fields: [] }), null);
    assert.equal(
        parseVizDeclaration({
            ...validDeclaration,
            fields: [validDeclaration.fields[0], validDeclaration.fields[0]],
        }),
        null,
    );
    assert.equal(
        parseVizDeclaration({
            ...validDeclaration,
            configOptions: [
                {
                    name: 'showLabels',
                    label: 'Show labels',
                    type: 'boolean',
                    default: 'yes',
                },
            ],
        }),
        null,
    );
    assert.equal(
        parseVizDeclaration({ ...validDeclaration, colorPalette: 'default' }),
        null,
    );
    assert.equal(
        parseVizDeclaration({
            ...validDeclaration,
            configOptions: [
                {
                    name: 'showLabels',
                    type: 'boolean',
                    default: true,
                },
            ],
        }),
        null,
    );
    assert.equal(
        parseVizDeclaration({
            ...validDeclaration,
            configOptions: [
                {
                    name: 'orientation',
                    label: 'Orientation',
                    type: 'select',
                    choices: [],
                    default: 'horizontal',
                },
            ],
        }),
        null,
    );
    assert.equal(
        parseVizDeclaration({
            ...validDeclaration,
            configOptions: [
                {
                    name: 'maxBars',
                    label: 'Maximum bars',
                    type: 'number',
                    default: 12,
                    min: 'one',
                },
            ],
        }),
        null,
    );
});

test('parseVizDeclaration accepts select choices and numeric bounds', () => {
    const declaration = parseVizDeclaration({
        ...validDeclaration,
        configOptions: [
            {
                name: 'orientation',
                label: 'Orientation',
                group: 'Layout',
                type: 'select',
                choices: [
                    { value: 'horizontal', label: 'Horizontal' },
                    { value: 'vertical', label: 'Vertical' },
                ],
                default: 'horizontal',
            },
            {
                name: 'maxBars',
                label: 'Maximum bars',
                type: 'number',
                default: 12,
                min: 1,
                max: 50,
            },
        ],
    });

    assert.deepEqual(declaration?.configOptions, [
        { name: 'orientation', type: 'select', default: 'horizontal' },
        { name: 'maxBars', type: 'number', default: 12 },
    ]);
});

const renderResult = (): Omit<RenderResult, 'rules'> => ({
    cell: 'variant__fixture__r1',
    error: null,
    settled: true,
    durationMs: 0,
    pageErrors: [],
    consoleErrors: [],
    fatalMarker: false,
    boundaryMarker: false,
    rootChildren: 3,
    rootTextLength: 42,
    vizContextRequests: 1,
    vizContextChanged: true,
    queries: [],
    blockedFetches: [],
    exports: [],
    screenshot: null,
});

test('viz render rules require the SDK handshake and a changed root', () => {
    assert.deepEqual(renderRules(renderResult(), 'data_app_viz'), {
        'renders-clean': true,
        'received-viz-context': true,
        'renders-with-viz-context': true,
    });
    assert.equal(
        renderRules(
            { ...renderResult(), vizContextChanged: false },
            'data_app_viz',
        )['renders-with-viz-context'],
        false,
    );
    assert.equal(
        renderRules(
            { ...renderResult(), vizContextRequests: 0 },
            'data_app_viz',
        )['received-viz-context'],
        false,
    );
});

test('query render rules still apply only to full data apps', () => {
    assert.deepEqual(Object.keys(renderRules(renderResult(), null)), [
        'renders-clean',
        'made-metric-queries',
        'queries-valid-fields',
    ]);
});

test('the declaration is read from the same CLI result event as production', () => {
    const analysis = analyzeStream([
        {
            atMs: 0,
            line: JSON.stringify({
                type: 'result',
                result: 'done',
                structured_output: validDeclaration,
            }),
        },
    ]);
    assert.deepEqual(analysis.structuredOutput, validDeclaration);
    assert.notEqual(parseVizDeclaration(analysis.structuredOutput), null);
    assert.equal(
        analyzeStream([
            { atMs: 0, line: JSON.stringify({ type: 'result', result: 'x' }) },
        ]).structuredOutput,
        null,
    );
});
