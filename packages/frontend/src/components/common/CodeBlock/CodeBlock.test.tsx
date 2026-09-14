import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import CodeBlock from './CodeBlock';

describe('CodeBlock', () => {
    it('renders line numbers', () => {
        const { container } = renderWithProviders(
            <CodeBlock
                code={'select 1;\nselect 2;'}
                language="sql"
                withLineNumbers
            />,
        );

        expect(
            container.querySelector('code[aria-hidden="true"]'),
        ).toHaveTextContent('1 2');
    });

    it('hides the copy control', () => {
        renderWithProviders(
            <CodeBlock
                code="select 1;"
                language="sql"
                withCopyButton={false}
            />,
        );

        expect(
            screen.queryByRole('button', { name: 'Copy' }),
        ).not.toBeInTheDocument();
    });

    it('calls onCopy', async () => {
        const onCopy = vi.fn();
        renderWithProviders(
            <CodeBlock code="select 1;" language="sql" onCopy={onCopy} />,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Copy' }));

        expect(onCopy).toHaveBeenCalledOnce();
    });
});
