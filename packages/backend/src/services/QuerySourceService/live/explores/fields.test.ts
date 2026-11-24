import { ApiConnectorType, DimensionType } from '@lightdash/common';
import { getLiveBaseLayer } from './build';
import {
    getInitialLiveSourceFieldEdits,
    getLiveFieldEditKey,
    getLiveModelFieldInputs,
    parseLiveSourceFieldState,
    type ScannedLiveSourceField,
} from './fields';

describe('built-in live source fields', () => {
    test.each(Object.values(ApiConnectorType))(
        'every built-in %s field tells people and agents what it means',
        (connector) => {
            const { definitions } = getLiveBaseLayer(connector);
            const undescribed = definitions
                .flatMap((definition) => [
                    ...definition.dimensions,
                    ...definition.metrics,
                ])
                .filter((field) => !field.description?.trim())
                .map((field) => field.name);
            expect(undescribed).toEqual([]);
        },
    );
});

describe('fields of several scanned explores', () => {
    const scanned = (name: string, model?: string): ScannedLiveSourceField => ({
        kind: 'dimension',
        definition: {
            name,
            apiName: name,
            label: name,
            type: DimensionType.STRING,
            filterOperators: [],
        },
        isInternal: false,
        ...(model ? { model } : {}),
    });
    const fields = [
        scanned('amount'),
        scanned('email', 'contacts'),
        scanned('createdate', 'contacts'),
        scanned('createdate', 'companies'),
    ];

    it('keeps the first explore’s edits under bare names, as stored before', () => {
        expect(getLiveFieldEditKey(null, 'amount')).toBe('amount');
        expect(getLiveFieldEditKey('contacts', 'email')).toBe('contacts.email');
    });

    it('gives each explore only its own fields and edits', () => {
        const edits = {
            amount: { inUse: true, lastEdit: null },
            'contacts.createdate': { inUse: true, lastEdit: null },
            'companies.createdate': { inUse: false, lastEdit: null },
        };
        const contacts = getLiveModelFieldInputs({
            model: 'contacts',
            scannedFields: fields,
            edits,
        });
        expect(contacts.scannedFields.map((f) => f.definition.name)).toEqual([
            'email',
            'createdate',
        ]);
        expect(contacts.edits).toEqual({
            createdate: { inUse: true, lastEdit: null },
        });
        const first = getLiveModelFieldInputs({
            model: null,
            scannedFields: fields,
            edits,
        });
        expect(first.scannedFields.map((f) => f.definition.name)).toEqual([
            'amount',
        ]);
        expect(first.edits).toEqual({
            amount: { inUse: true, lastEdit: null },
        });
    });

    it('keeps every explore’s scanned fields in use for a source built before curation', () => {
        expect(
            Object.keys(
                getInitialLiveSourceFieldEdits({
                    scannedFields: fields,
                    isExistingSource: true,
                }),
            ),
        ).toEqual([
            'amount',
            'contacts.email',
            'contacts.createdate',
            'companies.createdate',
        ]);
    });
});

describe('stored live source field state', () => {
    it('keeps a scanned field’s value labels', () => {
        const valueLabels = { closedwon: 'Closed Won' };
        const state = parseLiveSourceFieldState({
            lastScan: {
                scannedAt: '2026-11-24T10:00:00.000Z',
                fields: [
                    {
                        kind: 'dimension',
                        definition: {
                            name: 'dealstage_label',
                            apiName: 'dealstage:label',
                            label: 'Deal Stage',
                            filterOperators: [],
                            type: DimensionType.STRING,
                            valueLabels,
                        },
                        isInternal: false,
                    },
                ],
            },
            fields: null,
        });
        expect(state.lastScan?.fields[0].definition).toMatchObject({
            valueLabels,
        });
    });
});
