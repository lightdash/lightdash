import {
    everyBlockSpecMock,
    moveChartsSpecMock,
} from '@lightdash/common/src/ee/AiAgent/generativeUi/generativeUiSpec.mock';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { GenerativeUiResolvedView } from './GenerativeUiResolvedView';

describe('GenerativeUiResolvedView', () => {
    it('shows the outcome and the submitted values of visible fields', () => {
        renderWithProviders(
            <GenerativeUiResolvedView
                toolArgs={everyBlockSpecMock}
                metadata={{
                    status: 'success',
                    state: {
                        name: 'Finance',
                        order: 2,
                        reviewOn: null,
                        nested: false,
                        parentSpaceUuid: null,
                        notes: '',
                        access: 'private',
                        tags: ['finance', 'weekly'],
                    },
                }}
            />,
        );

        expect(screen.getByText('Done')).toBeInTheDocument();
        expect(screen.getByText('Create a space')).toBeInTheDocument();
        expect(screen.getByText('Private')).toBeInTheDocument();
        expect(screen.getByText('Finance, Weekly')).toBeInTheDocument();
        expect(screen.queryByText('Parent space')).not.toBeInTheDocument();
    });

    it('labels a skipped card', () => {
        renderWithProviders(
            <GenerativeUiResolvedView
                toolArgs={moveChartsSpecMock}
                metadata={{
                    status: 'dismissed',
                    state: { spaceUuid: null, chartUuids: [] },
                }}
            />,
        );

        expect(screen.getByText('Skipped')).toBeInTheDocument();
        expect(screen.getAllByText('—')).toHaveLength(2);
    });

    it('renders nothing for a card that could not be shown', () => {
        renderWithProviders(
            <GenerativeUiResolvedView
                toolArgs={moveChartsSpecMock}
                metadata={{ status: 'error' }}
            />,
        );

        expect(screen.queryByRole('heading')).not.toBeInTheDocument();
        expect(screen.queryByText(/form/i)).not.toBeInTheDocument();
    });
});
