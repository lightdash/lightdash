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
