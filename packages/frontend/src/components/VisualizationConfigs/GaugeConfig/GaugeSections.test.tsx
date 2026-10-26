import { ChartType, type GaugeSection } from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
    selectGaugeEditor,
    useVisualizationStore,
    type VisualizationStore,
} from '../../../features/visualization/store';
import { renderWithProviders } from '../../../testing/testUtils';
import { withVisualizationStore } from '../../../testing/visualizationStore';
import GaugeSections from './GaugeSections';

const renderSections = (sections: GaugeSection[]) => {
    const Wrapper = withVisualizationStore({
        type: ChartType.GAUGE,
        config: { sections },
    });
    const storeRef: { current: VisualizationStore | null } = { current: null };
    const StoreProbe = () => {
        storeRef.current = useVisualizationStore();
        return null;
    };
    renderWithProviders(
        <Wrapper>
            <StoreProbe />
            <GaugeSections />
        </Wrapper>,
    );
    return () => {
        if (!storeRef.current) throw new Error('store not mounted');
        return selectGaugeEditor(storeRef.current.getState()).sections;
    };
};

const typeMin = (sectionLabel: string, value: string) => {
    fireEvent.click(screen.getByText(sectionLabel));
    fireEvent.change(screen.getAllByLabelText('Min value')[0], {
        target: { value },
    });
};

const remove = (sectionLabel: string) => {
    const button = screen.getByRole('button', {
        name: `Remove ${sectionLabel}`,
    });
    fireEvent.click(button);
    fireEvent.click(button);
};

const waitPastDebounce = () =>
    waitFor(() => new Promise((resolve) => setTimeout(resolve, 400)));

describe('GaugeSections', () => {
    it('drops a pending edit of a section removed before it commits', async () => {
        const getSections = renderSections([
            { min: 0, max: 50, color: '#111111' },
        ]);

        typeMin('Section 1', '42');
        remove('Section 1');
        await waitPastDebounce();

        expect(getSections()).toEqual([]);
    });

    it('does not land a removed section pending edit on the section that moved into its place', async () => {
        const getSections = renderSections([
            { min: 0, max: 50, color: '#111111' },
            { min: 0, max: 50, color: '#222222' },
        ]);

        typeMin('Section 1', '42');
        remove('Section 1');
        await waitPastDebounce();

        expect(getSections()).toEqual([{ min: 0, max: 50, color: '#222222' }]);
    });
});
