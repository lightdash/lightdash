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

const inlineTags = {
    'ld-mem-cite': ({ id }: Record<string, string>) => (
        <span data-testid="citation">{id}</span>
    ),
};

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
    it('renders links, inline tags and code blocks through their renderers', () => {
        renderWithProviders(
            <WordsMarkdown
                isStreaming={false}
                renderLink={renderLink}
                inlineTags={inlineTags}
                codeBlocks={codeBlocks}
            >
                {[
                    'See [**Revenue**](/projects/p/dashboards/d/view#dashboard-link).<ld-mem-cite id="fiscal-year"></ld-mem-cite>',
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
        expect(screen.getByTestId('citation')).toHaveTextContent('fiscal-year');
        expect(screen.getByTestId('sql')).toHaveTextContent('select 1');
        expect(screen.getByTestId('sql')).toHaveAttribute(
            'data-incomplete',
            'false',
        );
    });

    it('keeps inline tags inside code as their source text', () => {
        const { container } = renderWithProviders(
            <WordsMarkdown isStreaming={false} inlineTags={inlineTags}>
                {[
                    '`<ld-mem-cite id="a"></ld-mem-cite>`',
                    '',
                    '```',
                    '<ld-mem-cite id="b"></ld-mem-cite>',
                    '```',
                ].join('\n')}
            </WordsMarkdown>,
        );

        expect(screen.queryByTestId('citation')).not.toBeInTheDocument();
        const codes = container.querySelectorAll('code');
        expect(codes[0]).toHaveTextContent(
            '<ld-mem-cite id="a"></ld-mem-cite>',
        );
        expect(codes[1]).toHaveTextContent(
            '<ld-mem-cite id="b"></ld-mem-cite>',
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
        const firstParagraph = () => container.querySelector('p');

        rerender(
            <WordsMarkdown isStreaming renderLink={renderLink}>
                {source}
            </WordsMarkdown>,
        );
        const stableParagraph = firstParagraph();
        expect(stableParagraph).toHaveTextContent(
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

    it('passes custom code renderers the source text of tags inside a long fence', () => {
        renderWithProviders(
            <WordsMarkdown isStreaming={false} codeBlocks={codeBlocks}>
                {['````sql', '```', "select '<br>'", '````'].join('\n')}
            </WordsMarkdown>,
        );

        expect(screen.getByTestId('sql')).toHaveTextContent("select '<br>'");
    });

    it('keeps line breaks the model writes as <br> in table cells', () => {
        const { container } = renderWithProviders(
            <WordsMarkdown isStreaming={false}>
                {'| Status |\n|---|\n| one<br>two |'}
            </WordsMarkdown>,
        );

        expect(container.querySelector('td br')).toBeInTheDocument();
        expect(container.querySelector('td')).toHaveTextContent('onetwo');
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
