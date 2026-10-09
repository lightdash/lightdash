import { WarehouseTypes, type AgentAccessReport } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { AgentAccessReportPanel } from './AgentAccessReportPanel';

const report: AgentAccessReport = {
    warehouseType: WarehouseTypes.BIGQUERY,
    subject: { kind: 'ai_service_account' },
    principal: 'agent@example.test',
    credentialSource: 'saved',
    status: 'complete',
    failureReason: null,
    message: null,
    datasets: [{ database: 'project', schema: 'dataset' }],
    tables: [
        {
            database: 'project',
            schema: 'dataset',
            name: 'one',
            status: { kind: 'readable', reason: null },
        },
        {
            database: 'project',
            schema: 'dataset',
            name: 'two',
            status: { kind: 'blocked', reason: 'access_denied' },
        },
    ],
    readableCount: 1,
    blockedCount: 1,
    errorCount: 0,
    checkedCount: 2,
    notCheckedCount: 0,
    totalCount: 2,
    truncatedCount: 0,
    checkedAt: new Date(2026, 9, 9, 12, 0, 0),
};

describe('AgentAccessReportPanel', () => {
    it('shows identity passed and the exact 1 of 2 access footer', () => {
        renderWithProviders(<AgentAccessReportPanel report={report} />);
        expect(screen.queryByText(/^Scope:/)).not.toBeInTheDocument();
        expect(
            screen.getByText(
                'Checked 12:00. The check reads no rows; row-level policies can still limit results.',
            ),
        ).toBeVisible();
        expect(screen.getByText('Passed')).toBeVisible();
        expect(screen.getByText('agent@example.test')).toBeVisible();
        expect(screen.getByText('dataset.one')).toBeVisible();
        expect(screen.getByText('can read')).toBeVisible();
        expect(screen.getByText('blocked by BigQuery')).toBeVisible();
        expect(
            screen.getByText(
                'People keep their own access. Agents can read 1 of 2 tables in this dataset.',
            ),
        ).toBeVisible();
    });
    it('shows the scope for multiple datasets in one project', () => {
        renderWithProviders(
            <AgentAccessReportPanel
                report={{
                    ...report,
                    datasets: [
                        ...report.datasets,
                        { database: 'project', schema: 'another' },
                    ],
                }}
            />,
        );
        expect(
            screen.getByText('Scope: project.dataset, project.another'),
        ).toBeVisible();
        expect(screen.getByText('dataset.one')).toBeVisible();
    });
    it('renders an overall failure without table rows', () => {
        renderWithProviders(
            <AgentAccessReportPanel
                report={{
                    ...report,
                    status: 'failed',
                    tables: [],
                    message: 'Check the saved key.',
                }}
            />,
        );
        expect(screen.getByRole('alert')).toHaveTextContent(
            'Check the saved key.',
        );
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
        expect(screen.queryByText('Passed')).not.toBeInTheDocument();
    });
    it('marks truncated coverage incomplete and distinguishes checked from listed', () => {
        renderWithProviders(
            <AgentAccessReportPanel
                report={{
                    ...report,
                    status: 'partial',
                    totalCount: 201,
                    truncatedCount: 199,
                }}
            />,
        );
        expect(screen.getByText('Check incomplete')).toBeVisible();
        expect(screen.getByText('and 199 more (not checked)')).toBeVisible();
        expect(
            screen.getByText(
                /Agents can read 1 of 2 checked tables. 201 tables are listed/,
            ),
        ).toBeVisible();
    });
    it('shows an empty inventory without an all-readable claim', () => {
        renderWithProviders(
            <AgentAccessReportPanel
                report={{
                    ...report,
                    tables: [],
                    totalCount: 0,
                    readableCount: 0,
                    blockedCount: 0,
                    checkedCount: 0,
                }}
            />,
        );
        expect(
            screen.getByText(
                'No tables are visible to this connection in this dataset.',
            ),
        ).toBeVisible();
        expect(screen.queryByText(/Agents can read/)).not.toBeInTheDocument();
    });
    it('shows unknown statuses and project names when scope crosses projects', () => {
        renderWithProviders(
            <AgentAccessReportPanel
                report={{
                    ...report,
                    status: 'partial',
                    errorCount: 1,
                    blockedCount: 0,
                    datasets: [
                        ...report.datasets,
                        { database: 'another', schema: 'dataset' },
                    ],
                    tables: [
                        {
                            ...report.tables[0],
                            status: { kind: 'error', reason: 'quota' },
                        },
                    ],
                }}
            />,
        );
        expect(screen.getByText('project.dataset.one')).toBeVisible();
        expect(screen.getByText('could not check')).toBeVisible();
        expect(screen.getByText('Quota reached')).toBeVisible();
        expect(
            screen.queryByText('blocked by BigQuery'),
        ).not.toBeInTheDocument();
        expect(screen.getByText(/across these datasets/)).toBeVisible();
        expect(
            screen.getByText('Scope: project.dataset, another.dataset'),
        ).toBeVisible();
    });
});
