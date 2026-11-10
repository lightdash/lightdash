import { ChartKind, type DocumentSqlChart } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import type * as ReactRouter from 'react-router';
import DocumentSqlChartOpenButton from './DocumentSqlChartOpenButton';

const mocks = vi.hoisted(() => ({
    navigate: vi.fn(),
    canManageSqlRunner: true,
}));
vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof ReactRouter>()),
    useNavigate: () => mocks.navigate,
}));
vi.mock('./useCanManageSqlRunner', () => ({
    useCanManageSqlRunner: () => mocks.canManageSqlRunner,
}));

const chart: DocumentSqlChart = {
    name: 'Revenue by method',
    sql: 'select method, sum(amount) from payments group by 1',
    limit: 500,
    chartKind: ChartKind.TABLE,
    config: {
        type: ChartKind.TABLE,
        metadata: { version: 1 },
        columns: {},
        display: undefined,
    },
    warehouseConnectionUuid: 'connection-uuid',
};

const renderButton = () =>
    render(
        <MantineProvider>
            <DocumentSqlChartOpenButton projectUuid="project" chart={chart} />
        </MantineProvider>,
    );

describe('DocumentSqlChartOpenButton', () => {
    beforeEach(() => {
        mocks.navigate.mockClear();
        mocks.canManageSqlRunner = true;
    });

    it('opens SQL Runner prefilled with the chart SQL, limit and connection', () => {
        renderButton();

        fireEvent.click(
            screen.getByRole('button', { name: /open in sql runner/i }),
        );

        expect(mocks.navigate).toHaveBeenCalledWith(
            '/projects/project/sql-runner',
            {
                state: {
                    sql: chart.sql,
                    limit: 500,
                    warehouseConnectionUuid: 'connection-uuid',
                },
            },
        );
    });

    it('is hidden without SQL Runner access', () => {
        mocks.canManageSqlRunner = false;

        renderButton();

        expect(
            screen.queryByRole('button', { name: /open in sql runner/i }),
        ).not.toBeInTheDocument();
    });
});
