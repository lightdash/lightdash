import type { LearnWorkspaceFileSummary } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FileTree from './FileTree';

const files: LearnWorkspaceFileSummary[] = [
    { path: 'models/orders.yml', editable: true },
    { path: 'seeds/config.yml', editable: true },
    { path: 'dbt_project.yml', editable: false },
];

const renderTree = (
    onSelect: (path: string) => void = vi.fn(),
    selectedPath: string | null = null,
) =>
    render(
        <MantineProvider env="test">
            <FileTree
                files={files}
                selectedPath={selectedPath}
                onSelect={onSelect}
            />
        </MantineProvider>,
    );

describe('FileTree', () => {
    it('expands models/ by default, showing the editable file inside it', () => {
        renderTree();

        expect(screen.getByText('models')).toBeInTheDocument();
        expect(screen.getByText('orders.yml')).toBeInTheDocument();
    });

    it('leaves other directories collapsed by default', () => {
        renderTree();

        expect(screen.getByText('seeds')).toBeInTheDocument();
        expect(screen.queryByText('config.yml')).not.toBeInTheDocument();
    });

    it('renders a read-only root file', () => {
        renderTree();

        expect(screen.getByText('dbt_project.yml')).toBeInTheDocument();
    });

    it('calls onSelect with the file path when a file row is clicked', () => {
        const onSelect = vi.fn();
        renderTree(onSelect);

        fireEvent.click(screen.getByText('orders.yml'));

        expect(onSelect).toHaveBeenCalledWith('models/orders.yml');
    });

    it('does not treat directory clicks as a selection', () => {
        const onSelect = vi.fn();
        renderTree(onSelect);

        fireEvent.click(screen.getByText('seeds'));

        expect(onSelect).not.toHaveBeenCalled();
        expect(screen.getByText('config.yml')).toBeInTheDocument();
    });

    it('writes tour anchor attributes on file rows in the required order', () => {
        renderTree();

        const row = screen
            .getByText('orders.yml')
            .closest('[data-tour-anchor]');
        expect(row).not.toBeNull();

        const tourAttrNames = Array.from(row!.attributes)
            .map((attr) => attr.name)
            .filter((name) => name.startsWith('data-tour'));

        expect(tourAttrNames).toEqual([
            'data-tour-anchor',
            'data-tour-hint',
            'data-tour-hint-named',
            'data-tour-value',
        ]);
        expect(row).toHaveAttribute('data-tour-anchor', 'workspace-file');
        expect(row).toHaveAttribute('data-tour-hint', 'Open the file');
        expect(row).toHaveAttribute('data-tour-hint-named', 'Open {value}');
        expect(row).toHaveAttribute('data-tour-value', 'models/orders.yml');
    });

    it('does not write tour anchor attributes on directory rows', () => {
        renderTree();

        const dirRow = screen
            .getByText('models')
            .closest('.mantine-NavLink-root');
        expect(dirRow?.hasAttribute('data-tour-anchor')).toBe(false);
    });

    it('marks editable files with data-learn-editable=true and read-only files with false', () => {
        renderTree();

        const editableRow = screen
            .getByText('orders.yml')
            .closest('[data-learn-file]');
        expect(editableRow).toHaveAttribute(
            'data-learn-file',
            'models/orders.yml',
        );
        expect(editableRow).toHaveAttribute('data-learn-editable', 'true');

        const readOnlyRow = screen
            .getByText('dbt_project.yml')
            .closest('[data-learn-file]');
        expect(readOnlyRow).toHaveAttribute('data-learn-editable', 'false');
    });
});
