import { WarehouseTypes } from '@lightdash/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { store } from '.';
import { executeSqlQuery } from '../../queryRunner/executeQuery';
import { getPivotQueryFunctionForSqlQuery } from '../../queryRunner/sqlRunnerPivotQueries';
import {
    initialState,
    resetState,
    selectConnectionRequest,
    selectSqlRunnerResultsRunner,
    setConnectionRoute,
    setState,
    sqlRunnerSlice,
    type SqlRunnerConnection,
} from './sqlRunnerSlice';
import { runSqlQuery } from './thunks';

vi.mock('../../queryRunner/executeQuery', () => ({
    executeSqlQuery: vi.fn(),
}));

vi.mock('../../queryRunner/sqlRunnerPivotQueries', () => ({
    getPivotQueryFunctionForSqlQuery: vi.fn(() => async () => ({})),
}));

const finance: SqlRunnerConnection = {
    warehouseConnectionUuid: 'finance-uuid',
    name: 'Finance',
    warehouseType: WarehouseTypes.BIGQUERY,
};
const original: SqlRunnerConnection = {
    warehouseConnectionUuid: null,
    name: 'Warehouse',
    warehouseType: WarehouseTypes.POSTGRES,
};

const results = (rows: number) => ({
    queryUuid: `query-${rows}`,
    fileUrl: `/results-${rows}`,
    results: Array.from({ length: rows }, (_, index) => ({ id: index })),
    columns: [{ reference: 'id' }],
});

const run = () =>
    store.dispatch(
        runSqlQuery({
            sql: 'select 1',
            limit: 10,
            projectUuid: 'project-uuid',
            parameterValues: {},
        }),
    );

describe('SQL runner runs on the active connection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        store.dispatch(resetState());
    });

    it('runs on the chosen extra connection in a multi project', async () => {
        vi.mocked(executeSqlQuery).mockResolvedValueOnce(results(1));
        store.dispatch(
            setConnectionRoute({ route: 'multi', connection: finance }),
        );

        await run();

        expect(executeSqlQuery).toHaveBeenCalledWith(
            'project-uuid',
            'select 1',
            10,
            {},
            true,
            'finance-uuid',
        );
        expect(store.getState().sqlRunner.sqlRows).toHaveLength(1);
    });

    it('runs on the original with null in a multi project', async () => {
        vi.mocked(executeSqlQuery).mockResolvedValueOnce(results(1));
        store.dispatch(
            setConnectionRoute({ route: 'multi', connection: original }),
        );

        await run();

        expect(vi.mocked(executeSqlQuery).mock.calls[0][5]).toBeNull();
    });

    it("sends main's request with no connection in a single project", async () => {
        vi.mocked(executeSqlQuery).mockResolvedValueOnce(results(1));
        store.dispatch(setConnectionRoute({ route: 'single' }));

        await run();

        expect(executeSqlQuery).toHaveBeenCalledWith(
            'project-uuid',
            'select 1',
            10,
            {},
            true,
            undefined,
        );
    });

    it.each([
        {
            name: 'no connection is chosen in a multi project',
            route: { route: 'multi', connection: null } as const,
            message: 'Choose a connection before you run this query.',
        },
        {
            name: 'the project is still loading',
            route: { route: 'pending' } as const,
            message: 'The project is still loading. Run the query again.',
        },
    ])('refuses to run when $name', async ({ route, message }) => {
        store.dispatch(setConnectionRoute(route));

        await run();

        expect(executeSqlQuery).not.toHaveBeenCalled();
        expect(store.getState().sqlRunner.queryError).toMatchObject({
            message,
        });
    });

    it('clears the results when the active connection changes', async () => {
        vi.mocked(executeSqlQuery).mockResolvedValueOnce(results(2));
        store.dispatch(
            setConnectionRoute({ route: 'multi', connection: original }),
        );
        await run();
        expect(store.getState().sqlRunner.sqlRows).toHaveLength(2);

        store.dispatch(
            setConnectionRoute({ route: 'multi', connection: finance }),
        );

        expect(store.getState().sqlRunner.sqlRows).toBeUndefined();
        expect(store.getState().sqlRunner.queryUuid).toBeUndefined();
        expect(store.getState().sqlRunner.warehouseConnectionType).toBe(
            WarehouseTypes.BIGQUERY,
        );
        expect(store.getState().sqlRunner.quoteChar).toBe('`');
    });

    it('drops the results of a run that finishes after the connection changed', async () => {
        let finish: (value: ReturnType<typeof results>) => void = () => {};
        vi.mocked(executeSqlQuery).mockReturnValueOnce(
            new Promise((resolve) => {
                finish = resolve;
            }),
        );
        store.dispatch(
            setConnectionRoute({ route: 'multi', connection: original }),
        );
        const running = run();
        store.dispatch(
            setConnectionRoute({ route: 'multi', connection: finance }),
        );
        finish(results(3));
        await running;

        expect(store.getState().sqlRunner.sqlRows).toBeUndefined();
        expect(store.getState().sqlRunner.queryIsLoading).toBe(false);
    });

    it.each([
        {
            route: { route: 'multi', connection: finance } as const,
            expected: 'finance-uuid',
        },
        {
            route: { route: 'multi', connection: original } as const,
            expected: null,
        },
        { route: { route: 'single' } as const, expected: undefined },
    ])(
        'builds the pivot query with the connection of the $route.route route',
        ({ route, expected }) => {
            store.dispatch(setConnectionRoute(route));

            selectSqlRunnerResultsRunner(store.getState());

            expect(
                vi.mocked(getPivotQueryFunctionForSqlQuery),
            ).toHaveBeenLastCalledWith(
                expect.objectContaining({ warehouseConnectionUuid: expected }),
            );
        },
    );

    it.each([
        {
            route: { route: 'single' } as const,
            expected: { ready: true, field: {} },
        },
        {
            route: { route: 'multi', connection: finance } as const,
            expected: {
                ready: true,
                field: { warehouseConnectionUuid: 'finance-uuid' },
            },
        },
        {
            route: { route: 'multi', connection: original } as const,
            expected: { ready: true, field: { warehouseConnectionUuid: null } },
        },
        {
            route: { route: 'multi', connection: null } as const,
            expected: { ready: false },
        },
        { route: { route: 'pending' } as const, expected: { ready: false } },
    ])(
        'gives the save request field for $route.route',
        ({ route, expected }) => {
            store.dispatch(setConnectionRoute(route));

            expect(selectConnectionRequest(store.getState())).toEqual(expected);
        },
    );

    it('treats a share link state without a connection route as still loading', () => {
        const shared = sqlRunnerSlice.reducer(
            undefined,
            setState({ ...initialState, sql: 'select 1' }),
        );

        expect(shared.connectionRoute).toEqual({ route: 'pending' });
    });
});
