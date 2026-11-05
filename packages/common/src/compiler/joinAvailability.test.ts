import {
    SupportedDbtAdapter,
    type DbtModelNode,
    type ModelInventoryEntry,
} from '../types/dbt';
import { InlineErrorType, type Explore } from '../types/explore';
import { DimensionType } from '../types/field';
import { DEFAULT_SPOTLIGHT_CONFIG } from '../types/lightdashProjectConfig';
import { warehouseClientMock } from './exploreCompiler.mock';
import { convertExplores, type DbtJoinAvailability } from './translator';
import { model } from './translator.mock';

const node = (source: string, name: string): DbtModelNode => ({
    ...structuredClone(model),
    name,
    alias: name,
    unique_id: `model.${source}.${name}`,
    package_name: source,
    lightdash_source_name: source,
    lightdash_source_uuid: `${source}-id`,
    relation_name: `${source}.${name}`,
    columns: { id: { name: 'id', data_type: DimensionType.NUMBER, meta: {} } },
    meta: {},
});
const availability: DbtJoinAvailability = Object.freeze({
    unavailableSources: Object.freeze([
        Object.freeze({ sourceName: 'offline', sourceUuid: 'offline-id' }),
    ]),
});
const compile = (
    models: DbtModelNode[],
    inventory: ModelInventoryEntry[],
    unavailableModels: ModelInventoryEntry[] = [],
    deferExploreNaming = true,
) =>
    convertExplores(
        models,
        false,
        SupportedDbtAdapter.POSTGRES,
        warehouseClientMock,
        { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
        {
            allowPartialCompilation: true,
            deferExploreNaming,
            includeModelIdentity: true,
            modelInventory: inventory,
            unavailableModels,
            joinAvailability: availability,
        },
    );
const join = (name: string) => [
    { join: name, alias: 'target', sql_on: '${orders.id} = ${target.id}' },
];

describe('join availability preserves resolution precedence', () => {
    it.each([
        'present',
        'excluded',
        'disabled',
        'latest-unavailable',
        'absent',
    ] as const)(
        'preserves own-source %s before foreign fallback refusal',
        async (state) => {
            const orders = node('primary', 'orders');
            orders.meta = {
                joins: join('calendar'),
                explores: {
                    inherited: {},
                    explicit: { joins: join('calendar') },
                    healthy: { joins: join('beta__calendar') },
                    failed: { joins: join('offline__calendar') },
                },
            };
            const own = node('primary', 'calendar');
            if (state === 'latest-unavailable')
                Object.assign(own, {
                    unique_id: 'model.primary.calendar.v1',
                    version: 1,
                    latest_version: 2,
                });
            const beta = node('beta', 'calendar');
            const models = [
                orders,
                beta,
                ...(state === 'present' || state === 'latest-unavailable'
                    ? [own]
                    : []),
            ];
            const rows = await compile(models, [
                orders,
                beta,
                ...(state !== 'absent' ? [own] : []),
            ]);
            for (const e of rows.filter(
                (candidate) =>
                    candidate.dbtModelIdentity?.uniqueId === orders.unique_id,
            ) as Explore[]) {
                if (e.name === 'healthy')
                    expect(e.tables.target).toMatchObject({
                        dbtSourceUuid: 'beta-id',
                        dbtPackageName: 'beta',
                        dbtModelUniqueId: beta.unique_id,
                    });
                else if (e.name !== 'failed' && state === 'present')
                    expect(e.tables.target).toMatchObject({
                        dbtSourceUuid: 'primary-id',
                        dbtModelUniqueId: own.unique_id,
                    });
                else {
                    expect(e.joinedTables).toEqual([]);
                    const reasons = {
                        absent: 'source inventory is unavailable: offline',
                        'latest-unavailable':
                            'declared latest version is unavailable',
                        excluded: 'own-source model is disabled or excluded',
                        disabled: 'own-source model is disabled or excluded',
                        present: '',
                    };
                    const reason =
                        e.name === 'failed'
                            ? 'source "offline" inventory is unavailable'
                            : reasons[state];
                    expect(e.warnings).toEqual([
                        expect.objectContaining({
                            type: InlineErrorType.MISSING_TABLE,
                            message: expect.stringContaining(reason),
                        }),
                    ]);
                }
            }
        },
    );
    it.each([false, true])(
        'keeps known failed model identities ambiguous (deferred %s)',
        async (deferred) => {
            const orders = node('primary', 'orders');
            orders.meta = { joins: join('calendar') };
            const beta = node('beta', 'calendar');
            const invalid = node('gamma', 'calendar');
            const rows = await convertExplores(
                [orders, beta],
                false,
                SupportedDbtAdapter.POSTGRES,
                warehouseClientMock,
                { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
                {
                    allowPartialCompilation: true,
                    deferExploreNaming: deferred,
                    includeModelIdentity: true,
                    modelInventory: [orders, beta, invalid],
                    unavailableModels: [invalid],
                },
            );
            const e = rows.find(
                (candidate) =>
                    candidate.dbtModelIdentity?.uniqueId === orders.unique_id,
            ) as Explore;
            expect(e.joinedTables).toEqual([]);
            expect(e.warnings).toEqual([
                expect.objectContaining({
                    message: expect.stringContaining('ambiguous'),
                }),
            ]);
        },
    );
    it('keeps own-source qualified-looking names ahead of unavailable namespace matching', async () => {
        const orders = node('primary', 'orders');
        orders.meta = { joins: join('offline__calendar') };
        const local = node('primary', 'offline__calendar');
        const rows = await compile([orders, local], [orders, local]);
        const e = rows.find(
            (candidate) =>
                candidate.dbtModelIdentity?.uniqueId === orders.unique_id,
        ) as Explore;
        expect(e.tables.target).toMatchObject({
            dbtSourceUuid: 'primary-id',
            dbtModelUniqueId: local.unique_id,
        });
        expect(e.warnings ?? []).toEqual([]);
    });
    it('refuses unavailable latest on an explicit healthy source without taking another source', async () => {
        const orders = node('primary', 'orders');
        orders.meta = { joins: join('beta__calendar') };
        const beta = {
            ...node('beta', 'calendar'),
            version: 1,
            latest_version: 2,
            unique_id: 'model.beta.calendar.v1',
        };
        const gamma = node('gamma', 'calendar');
        const rows = await compile(
            [orders, beta, gamma],
            [orders, beta, gamma],
        );
        const e = rows.find(
            (candidate) =>
                candidate.dbtModelIdentity?.uniqueId === orders.unique_id,
        ) as Explore;
        expect(e.joinedTables).toEqual([]);
        expect(e.warnings).toEqual([
            expect.objectContaining({
                message: expect.stringContaining(
                    'declared latest version is unavailable',
                ),
            }),
        ]);
    });
});
