import type { SearchFieldValuesFn } from '../types/aiAgentDependencies';
import {
    getSearchFieldValues,
    SEARCH_FIELD_VALUES_TIMEOUT_MS,
} from './searchFieldValues';

type ExecuteResult = { result: string; metadata: { status: string } };

const baseArgs = {
    table: 'orders',
    fieldId: 'orders_status',
    query: 'shipped',
    filters: null,
};

const execute = async (
    searchFieldValues: SearchFieldValuesFn,
    args: Record<string, unknown> = baseArgs,
): Promise<ExecuteResult> => {
    const tool = getSearchFieldValues({ searchFieldValues });
    const result = await tool.execute!(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        args as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {} as any,
    );
    return result as ExecuteResult;
};

describe('searchFieldValues tool', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('returns a success result for a normal query', async () => {
        const searchFieldValues = vi
            .fn<SearchFieldValuesFn>()
            .mockResolvedValue(['shipped', 'pending']);

        const result = await execute(searchFieldValues);

        expect(result.metadata).toEqual({ status: 'success' });
        expect(result.result).toContain('shipped');
        expect(searchFieldValues).toHaveBeenCalledTimes(1);
    });

    it('passes an empty/null query through to the dependency (does not reject it)', async () => {
        // A blank query is a legitimate "list all distinct values" request and
        // must keep working — it is not failed fast.
        const searchFieldValues = vi
            .fn<SearchFieldValuesFn>()
            .mockResolvedValue(['shipped', 'pending', 'cancelled']);

        const result = await execute(searchFieldValues, {
            ...baseArgs,
            query: null,
        });

        expect(result.metadata).toEqual({ status: 'success' });
        expect(searchFieldValues).toHaveBeenCalledTimes(1);
        // The schema coerces a null query to an empty string.
        expect(searchFieldValues).toHaveBeenCalledWith(
            expect.objectContaining({ query: '' }),
        );
    });

    it('returns an error within the timeout when the search never resolves', async () => {
        vi.useFakeTimers();

        // A dependency that never settles — the bug being guarded against.
        const searchFieldValues = vi
            .fn<SearchFieldValuesFn>()
            .mockImplementation(() => new Promise<string[]>(() => {}));

        const tool = getSearchFieldValues({ searchFieldValues });
        const resultPromise = tool.execute!(
            baseArgs,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {} as any,
        ) as Promise<ExecuteResult>;

        // Advance past the timeout budget so the race rejects.
        await vi.advanceTimersByTimeAsync(SEARCH_FIELD_VALUES_TIMEOUT_MS + 1);

        const result = await resultPromise;

        expect(result.metadata).toEqual({ status: 'error' });
        expect(result.result).toContain('timed out');
        expect(searchFieldValues).toHaveBeenCalledTimes(1);
    });
});
