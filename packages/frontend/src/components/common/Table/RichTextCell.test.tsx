import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import RichTextCell from './RichTextCell';

describe('RichTextCell', () => {
    it('renders plain text content', () => {
        renderWithProviders(<RichTextCell content="Hello world" />);
        expect(screen.getByText('Hello world')).toBeInTheDocument();
    });

    it('renders HTML content', () => {
        renderWithProviders(
            <RichTextCell content='<p style="color: red;">styled</p>' />,
        );
        expect(screen.getByText(/styled/)).toBeInTheDocument();
    });

    it('renders empty content without error', () => {
        const { container } = renderWithProviders(<RichTextCell content="" />);
        // eslint-disable-next-line testing-library/no-node-access
        expect(container.firstChild).toBeInTheDocument();
    });
});
