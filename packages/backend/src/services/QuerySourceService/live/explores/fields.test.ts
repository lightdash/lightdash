import { ApiConnectorType } from '@lightdash/common';
import { getLiveBaseLayer, getLiveWideDefinition } from './build';
import {
    getInitialLiveSourceFieldEdits,
    getRequiredFieldNames,
    listLiveSourceFields,
} from './fields';

const listNewSourceFields = (connector: ApiConnectorType) => {
    const base = getLiveWideDefinition(connector);
    return listLiveSourceFields({
        base,
        scannedFields: [],
        edits: getInitialLiveSourceFieldEdits({
            base,
            scannedFields: [],
            isExistingSource: false,
        }),
        usageByFieldName: {},
    });
};

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

describe('core live source fields', () => {
    test('a new source starts with only its core fields in use', () => {
        const counts = Object.fromEntries(
            Object.values(ApiConnectorType).map((connector) => {
                const fields = listNewSourceFields(connector);
                return [
                    connector,
                    `${fields.filter(({ inUse }) => inUse).length}/${fields.length}`,
                ];
            }),
        );
        expect(counts).toMatchInlineSnapshot(`
          {
            "attio": "3/3",
            "ga4": "24/33",
            "github": "11/15",
            "google_ads": "19/41",
            "linkedin_ads": "13/23",
            "meta_ads": "22/31",
            "posthog": "11/18",
            "pylon": "14/18",
            "search_console": "9/9",
            "youtube_analytics": "13/18",
          }
        `);
    });

    test('a new PostHog source leaves the non-core fields available but not in use', () => {
        const fields = listNewSourceFields(ApiConnectorType.POSTHOG);
        expect(
            fields.filter(({ inUse }) => !inUse).map(({ name }) => name),
        ).toEqual(
            expect.arrayContaining(['distinct_id', 'person_id', 'browser']),
        );
        expect(fields.find(({ name }) => name === 'event')?.inUse).toBe(true);
    });

    test.each(Object.values(ApiConnectorType))(
        'a new %s source keeps its required date field in use',
        (connector) => {
            const required = getRequiredFieldNames(
                getLiveWideDefinition(connector),
            );
            const fields = listNewSourceFields(connector);
            expect(
                fields
                    .filter(({ name }) => required.includes(name))
                    .every(({ inUse }) => inUse),
            ).toBe(true);
        },
    );

    test.each(Object.values(ApiConnectorType))(
        'an existing %s source keeps every built-in field in use',
        (connector) => {
            const base = getLiveWideDefinition(connector);
            const fields = listLiveSourceFields({
                base,
                scannedFields: [],
                edits: getInitialLiveSourceFieldEdits({
                    scannedFields: [],
                    isExistingSource: true,
                }),
                usageByFieldName: {},
            });
            expect(fields.every(({ inUse }) => inUse)).toBe(true);
        },
    );
});
