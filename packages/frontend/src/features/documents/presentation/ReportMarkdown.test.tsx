import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import ReportMarkdown from './ReportMarkdown';
import styles from './ReportPresentation.module.css';

const renderMarkdown = (markdown: string) =>
    render(
        <MantineProvider env="test">
            <ReportMarkdown markdown={markdown} />
        </MantineProvider>,
    );

describe('shared report markdown', () => {
    test('uses the same section presentation regardless of heading wording', () => {
        renderMarkdown(
            'Introduction\n\n## **Findings**\n\nNarrative\n\n## Conclusion\n\nNext steps',
        );
        expect(screen.getByText('Introduction')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Findings' })).toHaveClass(
            styles.reportFindingTitle,
        );
        expect(screen.getByRole('heading', { name: 'Conclusion' })).toHaveClass(
            styles.reportFindingTitle,
        );
        expect(screen.getByRole('heading', { name: 'Findings' }).tagName).toBe(
            'H2',
        );
    });

    test('does not treat a non-final Conclusion or ordinary final heading as a conclusion', () => {
        renderMarkdown('## Conclusion\n\nEarly\n\n## Further work\n\nLast');
        for (const name of ['Conclusion', 'Further work']) {
            expect(screen.getByRole('heading', { name })).toHaveClass(
                styles.reportFindingTitle,
            );
        }
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
        expect(container.textContent).toContain('😄');
    });
});
