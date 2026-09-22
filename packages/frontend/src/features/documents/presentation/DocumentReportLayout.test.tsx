import { MantineProvider } from '@mantine/core';
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import DocumentReportLayout from './DocumentReportLayout';
import ReportChartFrame from './ReportChartFrame';

describe('Shared report presentation', () => {
    it('places document actions beside the single title in the report header', () => {
        render(
            <MantineProvider env="test">
                <DocumentReportLayout
                    title="Orders review"
                    variant="document"
                    headings={[]}
                    actions={<button aria-label="Share">Share</button>}
                    metadata={<p>Last edited yesterday</p>}
                >
                    <p>Report narrative</p>
                </DocumentReportLayout>
            </MantineProvider>,
        );
        const title = screen.getByRole('heading', { name: 'Orders review' });
        const share = screen.getByRole('button', { name: 'Share' });
        expect(title.closest('header')).toContainElement(share);
        expect(screen.getByRole('article')).toContainElement(share);
        expect(title.closest('header')).toContainElement(
            screen.getByText('Last edited yesterday'),
        );
    });

    it('preserves declarative heading identities when an earlier cell failed to render', async () => {
        render(
            <MantineProvider env="test">
                <DocumentReportLayout
                    title="Partial report"
                    headings={[
                        { id: 'missing-heading', label: 'Unavailable section' },
                        { id: 'visible-heading', label: 'Visible section' },
                    ]}
                >
                    <h2 id="visible-heading" data-report-heading>
                        Visible section
                    </h2>
                </DocumentReportLayout>
            </MantineProvider>,
        );
        const heading = screen.getByRole('heading', { level: 2 });
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
        );
        expect(heading).toHaveAttribute('id', 'visible-heading');
        heading.scrollIntoView = vi.fn();
        fireEvent.click(
            screen.getByRole('button', { name: 'Visible section' }),
        );
        expect(heading.scrollIntoView).toHaveBeenCalledOnce();
        fireEvent.click(
            screen.getByRole('button', { name: 'Unavailable section' }),
        );
        expect(heading.scrollIntoView).toHaveBeenCalledOnce();
    });
    it('renders title, context, sections and chart evidence in document order', () => {
        render(
            <MantineProvider env="test">
                <DocumentReportLayout
                    title="Weekly report"
                    eyebrow="Document"
                    description="Revenue review"
                    headings={[{ id: 'findings', label: 'Findings' }]}
                >
                    <p>Introduction</p>
                    <h2 id="findings" data-report-heading>
                        Findings
                    </h2>
                    <ReportChartFrame title="Revenue">
                        <div>Chart content</div>
                    </ReportChartFrame>
                    <p>Next steps</p>
                </DocumentReportLayout>
            </MantineProvider>,
        );
        expect(
            screen.getByRole('heading', { level: 1, name: 'Weekly report' }),
        ).toBeInTheDocument();
        expect(screen.getByText('Revenue review')).toBeInTheDocument();
        const intro = screen.getByText('Introduction');
        const chart = screen.getByRole('figure', { name: 'Revenue' });
        expect(
            intro.compareDocumentPosition(chart) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            chart.compareDocumentPosition(screen.getByText('Next steps')) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Summary' })).toHaveAttribute(
            'aria-current',
            'location',
        );
    });

    it('navigates only headings inside its own report and tracks the selected section', async () => {
        render(
            <MantineProvider env="test">
                <DocumentReportLayout
                    title="First report"
                    headings={[{ id: 'first-heading', label: 'Findings' }]}
                >
                    <h2 id="first-heading" data-report-heading>
                        First findings
                    </h2>
                </DocumentReportLayout>
                <DocumentReportLayout
                    title="Second report"
                    headings={[{ id: 'second-heading', label: 'Findings' }]}
                >
                    <h2 id="second-heading" data-report-heading>
                        Second findings
                    </h2>
                </DocumentReportLayout>
            </MantineProvider>,
        );
        const first = screen.getByRole('heading', { name: 'First findings' });
        const second = screen.getByRole('heading', { name: 'Second findings' });
        first.scrollIntoView = vi.fn();
        second.scrollIntoView = vi.fn();
        const nav = screen.getAllByRole('navigation', {
            name: 'Report contents',
        })[1];
        fireEvent.click(within(nav).getByRole('button', { name: 'Findings' }));
        expect(second.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
        expect(first.scrollIntoView).not.toHaveBeenCalled();
        expect(
            within(nav).getByRole('button', { name: 'Findings' }),
        ).toHaveAttribute('aria-current', 'location');
        expect(
            within(nav).getByRole('button', { name: 'Summary' }),
        ).not.toHaveAttribute('aria-current');
    });

    it('maps legacy rendered headings without including the report title and renders optional contents badges', async () => {
        render(
            <MantineProvider env="test">
                <DocumentReportLayout
                    title="Legacy report"
                    headingSelector="h2"
                    headings={[{ id: 'sources', label: 'Sources', badge: 3 }]}
                >
                    <h2>Sources</h2>
                </DocumentReportLayout>
            </MantineProvider>,
        );
        const heading = screen.getByRole('heading', { level: 2 });
        await waitFor(() => expect(heading).toHaveAttribute('id', 'sources'));
        expect(screen.getByRole('heading', { level: 1 })).not.toHaveAttribute(
            'id',
            'sources',
        );
        expect(
            screen.getByRole('button', { name: 'Sources' }),
        ).toHaveTextContent('Sources3');
        heading.scrollIntoView = vi.fn();
        fireEvent.click(screen.getByRole('button', { name: 'Sources' }));
        expect(heading.scrollIntoView).toHaveBeenCalledOnce();
    });

    it('supports a title-only report without inventing sections', () => {
        render(
            <MantineProvider env="test">
                <DocumentReportLayout title="Empty document" headings={[]}>
                    <p>This document is empty.</p>
                </DocumentReportLayout>
            </MantineProvider>,
        );
        expect(
            within(screen.getByRole('navigation')).getAllByRole('button'),
        ).toHaveLength(1);
        expect(screen.getByText('This document is empty.')).toBeInTheDocument();
    });
});
