import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import MantineModal from '.';
import { mockViewport } from '../../../testing/mockViewport';
import { renderWithProviders } from '../../../testing/testUtils';

const Draft = () => {
    const [text, setText] = useState('');
    return (
        <input
            aria-label="Draft"
            value={text}
            onChange={(event) => setText(event.target.value)}
        />
    );
};

afterEach(() => vi.restoreAllMocks());

it('keeps child-local draft state when an open modal becomes fullscreen and back', () => {
    const viewport = mockViewport(1024);
    renderWithProviders(
        <MantineModal opened title="Create content" onClose={() => {}}>
            <Draft />
        </MantineModal>,
    );
    const input = screen.getByRole('textbox', { name: 'Draft' });
    fireEvent.change(input, { target: { value: 'Unsaved description' } });
    viewport.resize(744);
    expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(input);
    expect(input).toHaveValue('Unsaved description');
    viewport.resize(1024);
    expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(input);
    expect(input).toHaveValue('Unsaved description');
});
