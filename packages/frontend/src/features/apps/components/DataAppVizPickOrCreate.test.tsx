import { type ItemsMap } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import DataAppVizPickOrCreate from './DataAppVizPickOrCreate';

const render = (props: Partial<Parameters<typeof DataAppVizPickOrCreate>[0]>) =>
    renderWithProviders(
        <DataAppVizPickOrCreate
            picker={<div data-testid="picker">picker</div>}
            projectUuid="project-1"
            itemsMap={{} as ItemsMap}
            isBuilding={false}
            pendingPrompt={null}
            onRetry={null}
            error={null}
            onSubmit={vi.fn()}
            {...props}
        />,
    );

const enterCreateMode = () =>
    fireEvent.click(screen.getByRole('button', { name: /Create new/ }));

describe('DataAppVizPickOrCreate', () => {
    it('starts in pick mode with the picker and a way into authoring', () => {
        render({});

        expect(screen.getByTestId('picker')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Send' }),
        ).not.toBeInTheDocument();
    });

    it('hides the picker in create mode — they are separate modes', () => {
        render({});
        enterCreateMode();

        expect(screen.queryByTestId('picker')).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Send' }),
        ).toBeInTheDocument();
    });

    it('brings the picker back on cancel', () => {
        render({});
        enterCreateMode();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(screen.getByTestId('picker')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Send' }),
        ).not.toBeInTheDocument();
    });

    it('holds create mode while a build runs, so progress stays visible', () => {
        render({ isBuilding: true });

        expect(screen.queryByTestId('picker')).not.toBeInTheDocument();
        expect(screen.getByText(/Building/)).toBeInTheDocument();
    });

    it('offers no cancel mid-build — the build outlives it', () => {
        render({ isBuilding: true });

        expect(
            screen.queryByRole('button', { name: 'Cancel' }),
        ).not.toBeInTheDocument();
    });

    it('surfaces a failure without leaving create mode', () => {
        render({ error: 'Generation failed. Please try again.' });
        enterCreateMode();

        expect(
            screen.getByText('Generation failed. Please try again.'),
        ).toBeInTheDocument();
        expect(screen.queryByTestId('picker')).not.toBeInTheDocument();
    });
});
