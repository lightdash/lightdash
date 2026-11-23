import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import {
    type WordsCodeBlockRenderer,
    type WordsLinkProps,
} from './wordsContext';
import { WordsMarkdown } from './WordsMarkdown';

const renderLink = ({ attributes, text, children }: WordsLinkProps) => (
    <span data-testid="link" data-href={attributes.href} data-text={text}>
        {children}
    </span>
);

const codeBlocks: WordsCodeBlockRenderer[] = [
    {
        languages: ['sql'],
        component: ({ code, isIncomplete }) => (
            <div data-testid="sql" data-incomplete={isIncomplete}>
                {code}
            </div>
        ),
    },
];

describe('WordsMarkdown', () => {
    it('renders links and code blocks through their renderers', () => {
        renderWithProviders(
            <WordsMarkdown
                isStreaming={false}
                renderLink={renderLink}
                codeBlocks={codeBlocks}
            >
                {[
                    'See [**Revenue**](/projects/p/dashboards/d/view#dashboard-link).',
                    '',
                    '```sql',
                    'select 1',
                    '```',
                ].join('\n')}
            </WordsMarkdown>,
        );

        const link = screen.getByTestId('link');
        expect(link).toHaveAttribute(
            'data-href',
            '/projects/p/dashboards/d/view#dashboard-link',
        );
        expect(link).toHaveAttribute('data-text', 'Revenue');
        expect(link.querySelector('strong')).toHaveTextContent('Revenue');
        expect(screen.getByTestId('sql')).toHaveTextContent('select 1');
        expect(screen.getByTestId('sql')).toHaveAttribute(
            'data-incomplete',
            'false',
        );
    });

    it('streams: completes partial syntax, shows a caret, and keeps earlier blocks', () => {
        const source =
            'First paragraph with a [link](https://example.com).\n\nSecond **bold';
        const { container, rerender } = renderWithProviders(
            <WordsMarkdown isStreaming renderLink={renderLink}>
                {source.slice(0, 30)}
            </WordsMarkdown>,
        );

        rerender(
            <WordsMarkdown isStreaming renderLink={renderLink}>
                {source}
            </WordsMarkdown>,
        );
        expect(container.querySelector('p')).toHaveTextContent(
            'First paragraph with a link.',
        );
        expect(
            container.querySelector('p:last-of-type strong'),
        ).toHaveTextContent('bold');
        expect(
            container.querySelector('p:last-of-type [data-markdown="caret"]'),
        ).toBeInTheDocument();

        rerender(
            <WordsMarkdown isStreaming={false} renderLink={renderLink}>
                {`${source}**`}
            </WordsMarkdown>,
        );
        expect(
            container.querySelector('[data-markdown="caret"]'),
        ).not.toBeInTheDocument();
        expect(container.querySelectorAll('p')).toHaveLength(2);
    });

    it('keeps allowed raw HTML and drops unsafe markup', () => {
        const { container } = renderWithProviders(
            <WordsMarkdown isStreaming={false} renderLink={renderLink}>
                {[
                    'line<br>two x<sup>2</sup> <img src=x onerror=alert(1)> [bad](javascript:alert(1))',
                    '',
                    '<details open><summary>More</summary>',
                    '',
                    '- item',
                    '',
                    '</details>',
                ].join('\n')}
            </WordsMarkdown>,
        );

        expect(container.querySelector('p br')).toBeInTheDocument();
        expect(container.querySelector('sup')).toHaveTextContent('2');
        expect(container.querySelector('img')).not.toBeInTheDocument();
        expect(screen.queryByTestId('link')).not.toBeInTheDocument();
        expect(container.querySelector('p')).toHaveTextContent('bad');
        expect(container.querySelector('details')).toHaveAttribute('open');
        expect(container.querySelector('details li')).toHaveTextContent('item');
    });

    it('gives each answer its own footnote ids', () => {
        const answer = 'Use dates.[^1]\n\n[^1]: The return timestamp.';
        const { container } = renderWithProviders(
            <>
                <WordsMarkdown isStreaming={false}>{answer}</WordsMarkdown>
                <WordsMarkdown isStreaming={false}>{answer}</WordsMarkdown>
            </>,
        );

        const ids = [...container.querySelectorAll('li[id]')].map(
            ({ id }) => id,
        );
        expect(ids).toHaveLength(2);
        expect(new Set(ids).size).toBe(2);
        const refs = [...container.querySelectorAll('sup a')];
        expect(refs.map((ref) => ref.getAttribute('href'))).toEqual(
            ids.map((id) => `#${id}`),
        );
    });

    it('converts emoji shortcodes outside code', () => {
        const { container } = renderWithProviders(
            <WordsMarkdown isStreaming={false}>
                {'Done :white_check_mark: `:smile:`'}
            </WordsMarkdown>,
        );

        expect(container.querySelector('p')).toHaveTextContent('Done ✅');
        expect(container.querySelector('code')).toHaveTextContent(':smile:');
    });
});
