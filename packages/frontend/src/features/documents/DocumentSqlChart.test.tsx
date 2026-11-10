import {
    type ApiError,
    type DocumentSqlChart as DocumentSqlChartDefinition,
} from '@lightdash/common';
import { render } from '@testing-library/react';
import DocumentSqlChart from './DocumentSqlChart';

const mocks = vi.hoisted(() => ({
    error: null as unknown,
    renderView: vi.fn(),
}));
vi.mock('./useDocumentSqlChartResults', () => ({
    useDocumentSqlChartResults: () => ({
        data: undefined,
        error: mocks.error,
        refetch: vi.fn(),
    }),
}));
vi.mock('./DocumentSqlChartView', () => ({
    default: (props: unknown) => {
        mocks.renderView(props);
        return null;
    },
}));

const chart = {
    name: 'Orders',
    sql: 'select 1',
    limit: 100,
} as DocumentSqlChartDefinition;

const renderChart = () =>
    render(
        <DocumentSqlChart
            projectUuid="project"
            spaceUuid={null}
            reference={{
                documentUuid: 'document',
                versionUuid: 'version',
                chartId: 'c1',
            }}
            chart={chart}
        />,
    );

const renderedErrorMessage = () =>
    mocks.renderView.mock.lastCall?.[0].results.errorMessage;

beforeEach(() => {
    vi.clearAllMocks();
    mocks.error = null;
});

it('shows a failed warehouse query, which polling throws as a plain Error', () => {
    mocks.error = new Error('division by zero');
    renderChart();
    expect(renderedErrorMessage()).toBe('division by zero');
});

it('shows an API error message', () => {
    mocks.error = {
        status: 'error',
        error: {
            name: 'WarehouseQueryError',
            statusCode: 400,
            message: 'relation does not exist',
            data: {},
        },
    } satisfies ApiError;
    renderChart();
    expect(renderedErrorMessage()).toBe('relation does not exist');
});

it('shows no error while the query succeeds', () => {
    renderChart();
    expect(renderedErrorMessage()).toBeUndefined();
});
