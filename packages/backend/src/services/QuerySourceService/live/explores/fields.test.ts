import { ApiConnectorType } from '@lightdash/common';
import { ATTIO_DEAL_ATTRIBUTES } from '../integrations/attio/attio.fixtures';
import { getLiveIntegration } from '../registry';
import {
    getLiveBaseLayer,
    getLiveWideDefinition,
    toScannedLiveSourceFields,
} from './build';
import {
    getInitialLiveSourceFieldEdits,
    getRequiredFieldNames,
    listLiveSourceFields,
    type ScannedLiveSourceField,
} from './fields';

const listFields = (
    connector: ApiConnectorType,
    isExistingSource: boolean,
    scannedFields: ScannedLiveSourceField[] = [],
) => {
    const base = getLiveWideDefinition(connector);
    return listLiveSourceFields({
        base,
        scannedFields,
        edits: isExistingSource
            ? getInitialLiveSourceFieldEdits({
                  scannedFields,
                  isExistingSource: true,
              })
            : getInitialLiveSourceFieldEdits({
                  scannedFields,
                  isExistingSource: false,
                  base,
                  isOnByDefault:
                      getLiveIntegration(connector).scan?.isOnByDefault,
              }),
        usageByFieldName: {},
    });
};

const inUseNames = (fields: ReturnType<typeof listFields>) =>
    fields.filter(({ inUse }) => inUse).map(({ name }) => name);

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

    test.each(Object.values(ApiConnectorType))(
        '%s only switches off fields its wide explore has, never the required date',
        (connector) => {
            const [wide, ...others] = getLiveBaseLayer(connector).definitions;
            const names = new Set([
                ...wide.dimensions.map(({ name }) => name),
                ...wide.metrics.map(({ name }) => name),
            ]);
            const offByDefault = wide.offByDefault ?? [];
            expect(offByDefault.filter((name) => !names.has(name))).toEqual([]);
            expect(
                offByDefault.filter((name) =>
                    getRequiredFieldNames(wide).includes(name),
                ),
            ).toEqual([]);
            // Field edits only reach the wide explore, so a list elsewhere would do nothing
            expect(others.filter((other) => other.offByDefault)).toEqual([]);
        },
    );
});

describe('getInitialLiveSourceFieldEdits', () => {
    test('a new source starts with only the core built-in fields in use', () => {
        const counts = Object.fromEntries(
            Object.values(ApiConnectorType).map((connector) => {
                const fields = listFields(connector, false);
                return [
                    connector,
                    `${inUseNames(fields).length} of ${fields.length}`,
                ];
            }),
        );
        expect(counts).toMatchInlineSnapshot(`
          {
            "attio": "3 of 3",
            "ga4": "24 of 33",
            "github": "11 of 15",
            "google_ads": "19 of 41",
            "linkedin_ads": "13 of 23",
            "meta_ads": "22 of 31",
            "posthog": "11 of 18",
            "pylon": "14 of 18",
            "search_console": "9 of 9",
            "youtube_analytics": "13 of 18",
          }
        `);
    });

    test.each(Object.values(ApiConnectorType))(
        'a new %s source starts without the fields its explore switches off',
        (connector) => {
            const inUse = inUseNames(listFields(connector, false));
            const offByDefault =
                getLiveWideDefinition(connector).offByDefault ?? [];
            expect(inUse.filter((name) => offByDefault.includes(name))).toEqual(
                [],
            );
            expect(inUse).toEqual(
                expect.arrayContaining(
                    getRequiredFieldNames(getLiveWideDefinition(connector)),
                ),
            );
        },
    );

    test.each(Object.values(ApiConnectorType))(
        'an existing %s source keeps every built-in field in use',
        (connector) => {
            const fields = listFields(connector, true);
            expect(fields.filter(({ inUse }) => !inUse)).toEqual([]);
        },
    );

    test("a new Attio source starts with the object's name, choices, numbers, amounts and dates", () => {
        const scannedFields = toScannedLiveSourceFields(
            ApiConnectorType.ATTIO,
            { attioAttributes: ATTIO_DEAL_ATTRIBUTES },
        );
        expect(
            inUseNames(
                listFields(ApiConnectorType.ATTIO, false, scannedFields),
            ),
        ).toEqual([
            'record_id',
            'web_url',
            'created_at',
            'name',
            'stage',
            'value',
            'probability',
            'close_date',
            'categories',
            'attribute_count',
        ]);
    });

    test('an existing Attio source keeps the attributes it had in use', () => {
        const scannedFields = toScannedLiveSourceFields(
            ApiConnectorType.ATTIO,
            { attioAttributes: ATTIO_DEAL_ATTRIBUTES },
        );
        const fields = listFields(ApiConnectorType.ATTIO, true, scannedFields);
        expect(fields.filter(({ inUse }) => !inUse)).toEqual([]);
    });
});
