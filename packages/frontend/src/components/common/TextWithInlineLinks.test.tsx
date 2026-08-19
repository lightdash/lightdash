import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { TextWithInlineLinks } from './TextWithInlineLinks';

const renderText = (text: string) =>
    render(
        <MantineProvider>
            <TextWithInlineLinks text={text} />
        </MantineProvider>,
    );

describe('TextWithInlineLinks', () => {
    test('renders [label](url) as an anchor and keeps surrounding text', () => {
        renderText(
            'Fallback is disabled. [See docs](https://docs.lightdash.com/x#y) Cause: boom',
        );
        const link = screen.getByRole('link', { name: 'See docs' });
        expect(link).toHaveAttribute('href', 'https://docs.lightdash.com/x#y');
        expect(link).toHaveAttribute('target', '_blank');
        expect(screen.getByText(/Fallback is disabled\./)).toBeInTheDocument();
        expect(screen.getByText(/Cause: boom/)).toBeInTheDocument();
    });

    test('leaves plain text and non-http link syntax untouched', () => {
        const { container } = renderText(
            'relation [my_table](missing) does not exist',
        );
        expect(container.querySelector('a')).toBeNull();
        expect(
            screen.getByText('relation [my_table](missing) does not exist'),
        ).toBeInTheDocument();
    });
});
