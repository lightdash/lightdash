import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { buildStub } from '../testing/dataAppVizBuildStub';
import DataAppVizBuildStatus from './DataAppVizBuildStatus';

describe('DataAppVizBuildStatus', () => {
    it('reports what was asked for and how long it has been going', () => {
        renderWithProviders(
            <DataAppVizBuildStatus
                build={buildStub({
                    isBuilding: true,
                    pendingPrompt: 'make the bars horizontal',
                    claimedVersion: 2,
                })}
                elapsed="0:14"
            />,
        );

        expect(screen.getByText('Building v2')).toBeInTheDocument();
        expect(
            screen.getByText('make the bars horizontal'),
        ).toBeInTheDocument();
        expect(screen.getByText('· 0:14')).toBeInTheDocument();
    });

    // The version is claimed a beat after the send, so the first render of a
    // build has no number to show yet.
    it('names the build alone until it has claimed a version', () => {
        renderWithProviders(
            <DataAppVizBuildStatus
                build={buildStub({
                    isBuilding: true,
                    pendingPrompt: 'a donut of orders by status',
                    claimedVersion: null,
                })}
                elapsed={null}
            />,
        );

        expect(screen.getByText('Building')).toBeInTheDocument();
        expect(screen.queryByText(/· /)).not.toBeInTheDocument();
    });
});
