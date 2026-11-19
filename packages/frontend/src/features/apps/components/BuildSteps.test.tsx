import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../../testing/testUtils';
import BuildSteps from './BuildSteps';

describe('BuildSteps in the live header', () => {
    it('keeps a running step listed while it has earlier targets', () => {
        renderWithProviders(
            <BuildSteps
                steps={['Reading orders.yml', 'Reading customers.yml']}
                reasoning={[]}
                isLive
                omitCurrent
            />,
        );
        expect(screen.getByText('Reading data models')).toBeInTheDocument();
    });

    it('hides a running step the header already shows in full', () => {
        renderWithProviders(
            <BuildSteps
                steps={['Reading orders.yml', 'Editing App.jsx']}
                reasoning={[]}
                isLive
                omitCurrent
            />,
        );
        expect(screen.getByText('Read 1 data model')).toBeInTheDocument();
        expect(screen.queryByText('Editing files')).not.toBeInTheDocument();
    });
});
