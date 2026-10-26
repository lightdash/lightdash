import { ChartType } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type FC } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import {
    useVisualizationStore,
    type VisualizationStore,
} from '../../../features/visualization/store';
import { renderWithProviders } from '../../../testing/testUtils';
import { withVisualizationStore } from '../../../testing/visualizationStore';
import {
    columnOrder,
    results,
} from '../../LightdashVisualization/visualizationDifferential.fixtures';
import ConditionalFormattingList from './ConditionalFormattingList';

vi.mock('../../../hooks/useServerOrClientFeatureFlag', async (io) => ({
    ...(await io<object>()),
    useServerFeatureFlag: () => ({ data: undefined }),
}));

let store: VisualizationStore | undefined;
const StoreProbe: FC = () => {
    store = useVisualizationStore();
    return null;
};

describe('ConditionalFormattingList', () => {
    it('keeps a new rule mounted while its colour is typed', async () => {
        const user = userEvent.setup();
        const Wrapper = withVisualizationStore(
            { type: ChartType.TABLE, config: {} },
            {
                resultsData: results,
                itemsMap: results.fields,
                columnOrder,
                colorPalette: ['#111111'],
            },
        );
        renderWithProviders(
            <MemoryRouter>
                <Wrapper>
                    <ConditionalFormattingList />
                    <StoreProbe />
                </Wrapper>
            </MemoryRouter>,
        );

        await user.click(screen.getByRole('button', { name: /Add/ }));
        await user.click(screen.getByLabelText('Select color'));
        const hex = await screen.findByPlaceholderText(/custom HEX/);
        await user.clear(hex);
        await user.type(hex, '123456');

        expect(hex).toBeInTheDocument();
        expect(
            store?.getState().tableEditor.conditionalFormattings[0],
        ).toMatchObject({ color: '#123456' });
    });
});
