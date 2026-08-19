import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps } from 'react';
import { renderWithProviders } from '../../../testing/testUtils';
import { MergeSourceTree } from './MergeSourceTree';

const state = vi.hoisted(() => ({
    setSourceExplore: vi.fn(),
}));

vi.mock('../context/useMerge', () => ({
    useMerge: () => ({
        additionalSources: [
            {
                id: 'combined',
                exploreName: 'subscriptions',
                dimensions: ['subscriptions_started_at'],
                metrics: ['subscriptions_count'],
            },
        ],
        setSourceExplore: state.setSourceExplore,
        toggleSourceField: vi.fn(),
    }),
}));

vi.mock('../../../hooks/useExplore', () => ({
    useExplore: () => ({ data: undefined, isInitialLoading: false }),
}));

vi.mock('../../../components/Explorer/ExploreSideBar/BasePanel', () => ({
    default: ({
        onExploreClick,
    }: {
        onExploreClick: (explore: { name: string }) => void;
    }) => (
        <>
            <button
                type="button"
                onClick={() => onExploreClick({ name: 'subscriptions' })}
            >
                Subscriptions
            </button>
            <button
                type="button"
                onClick={() => onExploreClick({ name: 'customers' })}
            >
                Customers
            </button>
        </>
    ),
}));

vi.mock('../../../components/Explorer/ExploreTree', () => ({
    default: () => null,
}));

const renderPicker = (
    overrides: Partial<ComponentProps<typeof MergeSourceTree>> = {},
) => {
    const setIsChoosingExplore = vi.fn();
    renderWithProviders(
        <MergeSourceTree
            sourceId="combined"
            isChoosingExplore
            setIsChoosingExplore={setIsChoosingExplore}
            selectedFields={[]}
            {...overrides}
        />,
    );
    return { setIsChoosingExplore };
};

describe('MergeSourceTree table picker', () => {
    beforeEach(() => {
        state.setSourceExplore.mockReset();
    });

    it('returns to the selected fields without changing the source', async () => {
        const user = userEvent.setup();
        const { setIsChoosingExplore } = renderPicker();

        await user.click(
            screen.getByRole('button', { name: 'Back to fields' }),
        );

        expect(setIsChoosingExplore).toHaveBeenCalledWith(false);
        expect(state.setSourceExplore).not.toHaveBeenCalled();
    });

    it('does not clear fields when the current table is selected again', async () => {
        const user = userEvent.setup();
        const { setIsChoosingExplore } = renderPicker();

        await user.click(screen.getByRole('button', { name: 'Subscriptions' }));

        expect(setIsChoosingExplore).toHaveBeenCalledWith(false);
        expect(state.setSourceExplore).not.toHaveBeenCalled();
    });

    it('changes the source when a different table is selected', async () => {
        const user = userEvent.setup();
        const { setIsChoosingExplore } = renderPicker();

        await user.click(screen.getByRole('button', { name: 'Customers' }));

        expect(state.setSourceExplore).toHaveBeenCalledWith(
            'combined',
            'customers',
        );
        expect(setIsChoosingExplore).toHaveBeenCalledWith(false);
    });
});
