import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import Tree from './Tree';
import { type NestableItem } from './types';

const data: NestableItem[] = [
    { uuid: 'a', name: 'Alpha', path: 'a' },
    { uuid: 'b', name: 'Beta', path: 'a.b' },
    { uuid: 'c', name: 'Gamma', path: 'a.b.c' },
    { uuid: 'd', name: 'Delta', path: 'd' },
    { uuid: 'e', name: 'Epsilon', path: 'd.e' },
];

const renderTree = (isExpanded: boolean, value: string | null) =>
    renderWithProviders(
        <Tree
            topLevelLabel="Spaces"
            isExpanded={isExpanded}
            data={data}
            type="single"
            value={value}
            onChange={vi.fn()}
        />,
    );

describe('Tree', () => {
    it('only opens the selected item ancestors by default', () => {
        renderTree(false, 'c');

        expect(screen.getByText('Gamma')).toBeInTheDocument();
        expect(screen.queryByText('Epsilon')).not.toBeInTheDocument();
    });

    it('opens every node while expanded', () => {
        renderTree(true, 'c');

        expect(screen.getByText('Gamma')).toBeInTheDocument();
        expect(screen.getByText('Epsilon')).toBeInTheDocument();
    });

    it('collapses back to the selected item ancestors when no longer expanded', () => {
        const { rerender } = renderTree(true, 'c');
        expect(screen.getByText('Epsilon')).toBeInTheDocument();

        rerender(
            <Tree
                topLevelLabel="Spaces"
                isExpanded={false}
                data={data}
                type="single"
                value="c"
                onChange={vi.fn()}
            />,
        );

        expect(screen.getByText('Gamma')).toBeInTheDocument();
        expect(screen.queryByText('Epsilon')).not.toBeInTheDocument();
    });
});
