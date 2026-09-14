import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DeepResearchInlineMarkdown } from './DeepResearchInlineMarkdown';

describe('DeepResearchInlineMarkdown', () => {
    it('renders CommonMark inline forms and preserves safe link text', () => {
        const { container } = render(
            <DeepResearchInlineMarkdown
                markdown={`Escaped \\*literal\\*, \`orders_total\`, ~~superseded~~, [parenthesized](https://example.com/docs_(api)), [reference][docs], <https://example.com/autolink>, and [unsafe](javascript:alert(1)).

[docs]: https://example.com/reference`}
            />,
        );

        expect(screen.getByText(/Escaped \*literal\*/)).toBeVisible();
        expect(screen.getByText('orders_total').tagName).toBe('CODE');
        expect(screen.getByText('superseded').tagName).toBe('DEL');
        expect(
            screen.getByRole('link', { name: 'parenthesized' }),
        ).toHaveAttribute('href', 'https://example.com/docs_(api)');
        expect(screen.getByRole('link', { name: 'reference' })).toHaveAttribute(
            'href',
            'https://example.com/reference',
        );
        expect(
            screen.getByRole('link', {
                name: 'https://example.com/autolink',
            }),
        ).toHaveAttribute('href', 'https://example.com/autolink');
        expect(screen.queryByRole('link', { name: 'unsafe' })).toBeNull();
        expect(container).toHaveTextContent('unsafe');
    });
});
