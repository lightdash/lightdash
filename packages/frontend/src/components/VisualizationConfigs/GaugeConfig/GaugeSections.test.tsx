import { ChartType } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type FC } from 'react';
import { describe, expect, it } from 'vitest';
import {
    useVisualizationStore,
    type VisualizationStore,
} from '../../../features/visualization/store';
import { renderWithProviders } from '../../../testing/testUtils';
import { withVisualizationStore } from '../../../testing/visualizationStore';
import GaugeSections from './GaugeSections';

let store: VisualizationStore | undefined;
const StoreProbe: FC = () => {
    store = useVisualizationStore();
    return null;
};

const renderSections = () => {
    const Wrapper = withVisualizationStore({
        type: ChartType.GAUGE,
        config: {
            selectedField: 'orders_revenue',
            sections: [{ min: 5, max: 50, color: '#ff0000' }],
        },
    });
    renderWithProviders(
        <Wrapper>
            <GaugeSections />
            <StoreProbe />
        </Wrapper>,
    );
};

const savedSection = () => store?.getState().gaugeEditor.sections[0];

describe('GaugeSections', () => {
    it('commits a section min and max retyped after clearing the input', async () => {
        const user = userEvent.setup();
        renderSections();
        await user.click(screen.getByRole('button', { name: /Section 1/ }));

        const min = screen.getByLabelText('Min value');
        await user.clear(min);
        await user.type(min, '10');
        expect(savedSection()?.min).toBe(10);

        const max = screen.getByLabelText('Max value');
        await user.clear(max);
        await user.type(max, '70');
        expect(savedSection()?.max).toBe(70);
    });
});
