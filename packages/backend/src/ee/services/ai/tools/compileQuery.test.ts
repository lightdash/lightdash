import {
    DimensionType,
    FieldType,
    MetricType,
    SupportedDbtAdapter,
    type AnyType,
    type Explore,
} from '@lightdash/common';
import { AgentContext } from '../utils/AgentContext';
import { getCompileQuery } from './compileQuery';

const mockExplore: Explore = {
    name: 'customers',
    label: 'Customers',
    tags: [],
    baseTable: 'customers',
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    joinedTables: [],
    tables: {
        customers: {
            name: 'customers',
            label: 'Customers',
            database: 'test',
            schema: 'public',
            sqlTable: 'customers',
            lineageGraph: {},
            dimensions: {
                customer_id: {
                    name: 'customer_id',
                    label: 'Customer ID',
                    table: 'customers',
                    tableLabel: 'Customers',
                    type: DimensionType.STRING,
                    sql: '${TABLE}.customer_id',
                    fieldType: FieldType.DIMENSION,
                    compiledSql: 'customers.customer_id',
                    tablesReferences: ['customers'],
                    hidden: false,
                },
            },
            metrics: {
                total_customers: {
                    name: 'total_customers',
                    label: 'Total Customers',
                    table: 'customers',
                    tableLabel: 'Customers',
                    type: MetricType.COUNT,
                    sql: '${TABLE}.customer_id',
                    fieldType: FieldType.METRIC,
                    compiledSql: 'count(customers.customer_id)',
                    tablesReferences: ['customers'],
                    hidden: false,
                },
            },
        },
    },
};

describe('compileQuery tool', () => {
    const compileMiniMetricQuery = jest.fn();
    const compileQueryTool = getCompileQuery({ compileMiniMetricQuery });
    const agentContext = new AgentContext([mockExplore]);

    beforeEach(() => {
        jest.clearAllMocks();
    });

    const getResult = async (res: AnyType) => {
        if (res && typeof res === 'object' && Symbol.asyncIterator in res) {
            let out = '';
            for await (const chunk of res) {
                out += chunk.result;
            }
            return { result: out, metadata: { status: 'success' } };
        }
        return res;
    };

    it('should successfully compile a simple query', async () => {
        compileMiniMetricQuery.mockResolvedValueOnce({
            query: 'SELECT * FROM customers',
            parameterReferences: [],
        });

        const rawResult = await compileQueryTool.execute!(
            {
                vizConfig: {
                    exploreName: 'customers',
                    dimensions: ['customers_customer_id'],
                    metrics: ['customers_total_customers'],
                    sorts: [],
                    limit: 10,
                },
                filters: null,
                tableCalculations: null,
                customMetrics: null,
            },
            {
                toolCallId: 'test-id',
                messages: [],
                experimental_context: agentContext,
            },
        );

        const result = await getResult(rawResult);

        expect(result).toEqual({
            result: 'SELECT * FROM customers',
            metadata: {
                status: 'success',
            },
        });
        expect(compileMiniMetricQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                exploreName: 'customers',
                dimensions: ['customers_customer_id'],
                metrics: ['customers_total_customers'],
            }),
            [],
        );
    });

    it('should handle validation errors for missing explore', async () => {
        const rawResult = await compileQueryTool.execute!(
            {
                vizConfig: {
                    exploreName: 'non_existent',
                    dimensions: [],
                    metrics: [],
                    sorts: [],
                    limit: 10,
                },
                filters: null,
                tableCalculations: null,
                customMetrics: null,
            },
            {
                toolCallId: 'test-id',
                messages: [],
                experimental_context: agentContext,
            },
        );

        const result = await getResult(rawResult);

        expect(result.metadata.status).toBe('error');
        expect(result.result).toContain("Explore 'non_existent' not found");
    });

    it('should handle validation errors for missing fields', async () => {
        const rawResult = await compileQueryTool.execute!(
            {
                vizConfig: {
                    exploreName: 'customers',
                    dimensions: ['invalid_dimension'],
                    metrics: [],
                    sorts: [],
                    limit: 10,
                },
                filters: null,
                tableCalculations: null,
                customMetrics: null,
            },
            {
                toolCallId: 'test-id',
                messages: [],
                experimental_context: agentContext,
            },
        );

        const result = await getResult(rawResult);

        expect(result.metadata.status).toBe('error');
        expect(result.result).toContain(
            'Field with id "invalid_dimension" does not exist',
        );
    });

    it('should handle errors from compileMiniMetricQuery', async () => {
        compileMiniMetricQuery.mockRejectedValueOnce(
            new Error('Compilation failed'),
        );

        const rawResult = await compileQueryTool.execute!(
            {
                vizConfig: {
                    exploreName: 'customers',
                    dimensions: ['customers_customer_id'],
                    metrics: [],
                    sorts: [],
                    limit: 10,
                },
                filters: null,
                tableCalculations: null,
                customMetrics: null,
            },
            {
                toolCallId: 'test-id',
                messages: [],
                experimental_context: agentContext,
            },
        );

        const result = await getResult(rawResult);

        expect(result.metadata.status).toBe('error');
        expect(result.result).toContain('Compilation failed');
    });
});
