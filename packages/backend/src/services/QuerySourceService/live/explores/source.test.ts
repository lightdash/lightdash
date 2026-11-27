import { ApiConnectorType, DimensionType } from '@lightdash/common';
import { toLiveModelName } from '../integration';
import {
    getLiveStateWithExtension,
    getRefreshedLiveState,
} from '../liveSource.mock';
import { getLiveSourceDefinitionHashes } from './build';
import { type LiveExploreDefinition } from './definition';
import {
    checkLiveExtension,
    getLiveExtension,
    getLiveRefreshSummary,
    getLiveSourceModels,
    parseLiveSourceFieldState,
    pinLiveDefaults,
} from './source';

const { HUBSPOT } = ApiConnectorType;

const dimension = (name: string, onByDefault?: boolean) => ({
    name,
    apiName: name,
    label: name,
    type: DimensionType.STRING,
    filterOperators: [],
    ...(onByDefault === undefined ? {} : { onByDefault }),
});

const explore = (
    fields: ReturnType<typeof dimension>[],
    rest: Partial<LiveExploreDefinition> = {},
): LiveExploreDefinition => ({
    name: 'invoices',
    label: 'Invoices',
    description: '',
    dimensions: fields,
    metrics: [],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    ...rest,
});

describe('a source stored before Refresh returned explores', () => {
    const legacyField = (
        name: string,
        isInternal: boolean,
        model?: string,
    ) => ({
        kind: 'dimension',
        definition: dimension(name),
        isInternal,
        ...(model ? { model } : {}),
    });
    const stored = (fields: unknown) => ({
        connector: HUBSPOT,
        fields,
        lastScan: {
            scannedAt: '2026-11-24T10:00:00.000Z',
            fields: [
                legacyField('amount', false),
                legacyField('hs_object_id', true),
                legacyField('email', false, 'contacts'),
            ],
        },
    });

    it('reads its scan as the explores a Refresh found', () => {
        const { scan, legacy } = parseLiveSourceFieldState(stored(null));
        expect(scan).toBe(null);
        expect(legacy?.at).toBe('2026-11-24T10:00:00.000Z');
        expect(
            Object.entries(legacy?.extension.fields ?? {}).map(
                ([name, { dimensions }]) => [
                    name,
                    dimensions.map((field) => [field.name, field.onByDefault]),
                ],
            ),
        ).toEqual([
            [
                'deals',
                [
                    ['amount', true],
                    ['hs_object_id', false],
                ],
            ],
            ['contacts', [['email', true]]],
        ]);
    });

    it('keeps every field on for a source never curated', () => {
        expect(parseLiveSourceFieldState(stored(null)).fields).toEqual({
            hs_object_id: { inUse: true, lastEdit: null },
        });
    });

    it('keeps found fields an admin never put in use off, and their edits', () => {
        expect(
            parseLiveSourceFieldState(
                stored({ amount: { label: 'Value', lastEdit: null } }),
            ).fields,
        ).toEqual({
            amount: { label: 'Value', inUse: false, lastEdit: null },
            'contacts.email': { inUse: false, lastEdit: null },
        });
    });

    it('keeps a found field’s value labels', () => {
        const valueLabels = { closedwon: 'Closed Won' };
        const { legacy } = parseLiveSourceFieldState({
            connector: HUBSPOT,
            fields: null,
            lastScan: {
                scannedAt: '2026-11-24T10:00:00.000Z',
                fields: [
                    {
                        kind: 'dimension',
                        definition: { ...dimension('stage'), valueLabels },
                        isInternal: false,
                    },
                ],
            },
        });
        expect(legacy?.extension.fields?.deals.dimensions[0]).toMatchObject({
            valueLabels,
        });
    });

    it('reads what a Refresh stored over an older scan', () => {
        const metadata = { hubspotProperties: {} };
        const state = parseLiveSourceFieldState({
            ...stored(null),
            scan: { at: '2026-11-25T10:00:00.000Z', metadata },
        });
        expect(state.scan).toEqual({
            at: '2026-11-25T10:00:00.000Z',
            metadata,
        });
        expect(state.legacy).toBe(null);
        expect(state.fields).toEqual({});
    });
});

describe('checkLiveExtension', () => {
    it('refuses another shape, and fields for an explore the model lacks', () => {
        expect(() =>
            checkLiveExtension(HUBSPOT, { explores: [{ label: 1 }] }),
        ).toThrow('unexpected shape');
        expect(() =>
            checkLiveExtension(HUBSPOT, {
                fields: { invoices: { dimensions: [], metrics: [] } },
            }),
        ).toThrow("explores it doesn't have: invoices");
    });

    it('leaves out an explore whose id could widen its access', () => {
        expect(
            checkLiveExtension(HUBSPOT, {
                explores: [
                    explore([], { name: 'invoices', apiName: 'invoice' }),
                    explore([], { name: 'up', apiName: '../deals' }),
                    explore([], { name: 'any', apiName: '{object}' }),
                ],
            }),
        ).toEqual({ dropped: ['up', 'any'] });
    });

    it('leaves out an explore whose name it cannot use, and says which', () => {
        const extension = {
            fields: {
                contacts: { dimensions: [dimension('region')], metrics: [] },
            },
            explores: [
                explore([], { name: 'invoices', apiName: 'Invoice' }),
                // An earlier explore has the name
                explore([], { name: 'invoices', apiName: 'invoice' }),
                // Not a model name
                explore([], { name: 'Bad Name', apiName: 'bad' }),
                // A declared explore has the name
                explore([], { name: 'deals', apiName: 'custom_deals' }),
            ],
        };
        expect(checkLiveExtension(HUBSPOT, extension)).toEqual({
            dropped: ['invoices', 'Bad Name', 'deals'],
        });
        const kept = getLiveExtension(
            HUBSPOT,
            getLiveStateWithExtension(extension),
        );
        expect(kept.explores.map(({ apiName }) => apiName)).toEqual([
            'Invoice',
        ]);
        expect(Object.keys(kept.fields)).toEqual(['contacts']);
    });
});

describe('naming an explore only the vendor has', () => {
    it('makes a model name from the vendor id', () => {
        expect(toLiveModelName('Invoice__c')).toBe('invoice__c');
        expect(toLiveModelName('2-Custom Object!')).toBe('custom_object');
        expect(toLiveModelName('***')).toBe('explore');
        expect(toLiveModelName('x'.repeat(60))).toBe('x'.repeat(40));
    });
});

describe('a Refresh that changes a default', () => {
    const models = (
        onByDefault: boolean | undefined,
        fieldOn: boolean | undefined,
    ) =>
        getLiveSourceModels(
            HUBSPOT,
            getLiveStateWithExtension({
                explores: [
                    explore([dimension('total', fieldOn)], {
                        name: 'invoices',
                        apiName: 'Invoice',
                        onByDefault,
                    }),
                ],
            }),
        );

    it('keeps the explore and its fields as the source had them', () => {
        expect(
            pinLiveDefaults({
                previous: models(true, false),
                next: models(false, true),
                fields: {},
                explores: {},
            }),
        ).toEqual({
            fields: { 'invoices.total': { inUse: false, lastEdit: null } },
            explores: { invoices: { inUse: true, lastEdit: null } },
        });
    });

    it('leaves what an admin set alone', () => {
        const curated = {
            fields: { 'invoices.total': { inUse: true, lastEdit: null } },
            explores: { invoices: { inUse: false } },
        };
        expect(
            pinLiveDefaults({
                previous: models(true, false),
                next: models(false, true),
                ...curated,
            }),
        ).toEqual(curated);
    });

    it('reports the explores and fields it added and removed', () => {
        const toExploreName = (model: string) => `hubspot_${model}`;
        const before = models(true, true);
        const after = getLiveSourceModels(
            HUBSPOT,
            getLiveStateWithExtension({
                fields: {
                    deals: { dimensions: [dimension('amount_2')], metrics: [] },
                },
            }),
        );
        expect(
            getLiveRefreshSummary({
                previous: before,
                next: after,
                toExploreName,
            }),
        ).toEqual({
            addedExplores: [],
            removedExplores: ['hubspot_invoices'],
            addedFields: { hubspot_deals: ['amount_2'] },
            removedFields: {},
        });
    });
});

describe('explores built from the metadata a Refresh stored', () => {
    const { POSTHOG } = ApiConnectorType;
    const withPlan = getRefreshedLiveState({
        posthogProperties: {
            event: { results: [{ name: 'plan' }] },
            person: { results: [] },
        },
    });
    const fieldsOf = (state: typeof withPlan) =>
        getLiveSourceModels(POSTHOG, state)[0].definition.dimensions.map(
            ({ name }) => name,
        );

    it('turns the stored metadata into fields with the code of today', () => {
        expect(fieldsOf(withPlan)).toContain('property_plan');
    });

    it('reads metadata stored in a shape the code no longer knows as none', () => {
        const unknown = getRefreshedLiveState({
            posthogProperties: 'not an object',
        });
        expect(getLiveExtension(POSTHOG, unknown)).toEqual({
            fields: {},
            explores: [],
        });
        expect(fieldsOf(unknown)).not.toContain('property_plan');
    });

    it('changes an explore’s hash when the metadata adds a field, so a deploy rebuilds it', () => {
        const hashOf = (state: typeof withPlan) =>
            getLiveSourceDefinitionHashes(POSTHOG, state).events;
        expect(hashOf(withPlan)).not.toBe(
            hashOf(getRefreshedLiveState({ posthogProperties: undefined })),
        );
    });
});
