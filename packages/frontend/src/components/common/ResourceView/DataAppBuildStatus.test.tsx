import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import DataAppBuildStatus from './DataAppBuildStatus';

describe('DataAppBuildStatus', () => {
    it('shows the version building and the latest version available to preview', () => {
        renderWithProviders(
            <DataAppBuildStatus
                latestVersionNumber={10}
                latestVersionStatus="building"
                latestReadyVersionNumber={9}
            />,
        );

        expect(
            screen.getByText('Building v10 · Preview v9'),
        ).toBeInTheDocument();
    });

    it('explains that a first build has no preview yet', () => {
        renderWithProviders(
            <DataAppBuildStatus
                latestVersionNumber={1}
                latestVersionStatus="generating"
                latestReadyVersionNumber={null}
            />,
        );

        expect(
            screen.getByText('Building v1 · No preview yet'),
        ).toBeInTheDocument();
    });

    it('does not render for a finished build', () => {
        renderWithProviders(
            <DataAppBuildStatus
                latestVersionNumber={10}
                latestVersionStatus="ready"
                latestReadyVersionNumber={10}
            />,
        );

        expect(screen.queryByText(/Building/)).not.toBeInTheDocument();
    });
});
