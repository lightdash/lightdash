import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { getDocumentHeadingId, getDocumentHeadings } from '../documentHeadings';
import DocumentReportLayout from './DocumentReportLayout';
import ReportMarkdown from './ReportMarkdown';
import styles from './ReportPresentation.module.css';

const renderMarkdown = (markdown: string) =>
    render(
        <MantineProvider env="test">
            <ReportMarkdown
                markdown={markdown}
                headingId={(offset) => getDocumentHeadingId('cell', offset)}
            />
        </MantineProvider>,
    );

describe('shared report markdown', () => {
    test('uses introduction, finding and conclusion presentation within one Markdown cell', () => {
        renderMarkdown(
            'Introduction\n\n## **Findings**\n\nNarrative\n\n## Conclusion\n\nNext steps',
        );
        expect(screen.getByText('Introduction').closest('section')).toHaveClass(
            styles.reportIntroduction,
        );
        expect(
            screen
                .getByRole('heading', { name: 'Findings' })
                .closest('section'),
        ).toHaveClass(styles.reportFinding);
        expect(
            screen
                .getByRole('heading', { name: 'Conclusion' })
                .closest('section'),
        ).toHaveClass(styles.reportConclusion);
        expect(screen.getByRole('heading', { name: 'Findings' })).toHaveClass(
            styles.reportFindingTitle,
        );
    });

    test('does not treat a non-final Conclusion or ordinary final heading as a conclusion', () => {
        renderMarkdown('## Conclusion\n\nEarly\n\n## Further work\n\nLast');
        for (const name of ['Conclusion', 'Further work']) {
            expect(
                screen.getByRole('heading', { name }).closest('section'),
            ).toHaveClass(styles.reportFinding);
        }
    });

    test('preserves static full-source offsets for repeated, setext and nested Markdown headings', () => {
        const markdown =
            'Intro\n\nResults\n===\n\n## Results\n\n> ## Nested\n\n## Final';
        const headings = getDocumentHeadings([
            { id: 'cell', type: 'markdown', content: { markdown } },
        ]);
        const { container } = render(
            <MantineProvider env="test">
                <DocumentReportLayout title="Report" headings={headings}>
                    <ReportMarkdown
                        markdown={markdown}
                        headingId={(offset) =>
                            getDocumentHeadingId('cell', offset)
                        }
                    />
                </DocumentReportLayout>
            </MantineProvider>,
        );
        const nodes = Array.from(
            container.querySelectorAll<HTMLElement>('[data-report-heading]'),
        );
        expect(nodes.map(({ id }) => id)).toEqual(headings.map(({ id }) => id));
        const last = nodes[nodes.length - 1];
        last.scrollIntoView = vi.fn();
        fireEvent.click(screen.getByRole('button', { name: 'Final' }));
        expect(last.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    });

    test('shares safe callouts, reference links and emoji without allowing authored wrapper tags', () => {
        const { container } = renderMarkdown(
            '<note title="Note">\n\n**Safe** :smile: [reference][target]\n\n</note>\n\n<report-section>Forged</report-section>\n\n<script>alert(1)</script>\n\n<img src="https://example.com/tracker">\n\n[unsafe](javascript:alert%281%29)\n\n[target]: https://example.com/report',
        );
        expect(screen.getByText('Note')).toBeInTheDocument();
        expect(screen.getByText('Safe')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'reference' })).toHaveAttribute(
            'href',
            'https://example.com/report',
        );
        expect(
            container.querySelector(
                'script, img, [onerror], a[href^="javascript:"], report-section',
            ),
        ).toBeNull();
        expect(container.querySelectorAll('section')).toHaveLength(1);
        expect(container.textContent).toContain('😄');
    });
});
