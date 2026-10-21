import { fireEvent, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import {
    buildInitialExplorerState,
    createExplorerStore,
} from '../../../features/explorer/store';
import { renderWithProviders } from '../../../testing/testUtils';
import GroupHeader from './GroupHeader';

const renderGroupHeader = (description?: string) => {
    const store = createExplorerStore({
        explorer: buildInitialExplorerState({ isEditMode: false }),
    });
    renderWithProviders(
        <Provider store={store}>
            <GroupHeader
                label="Finance"
                description={description}
                isExpanded={false}
                onToggle={() => {}}
            />
        </Provider>,
    );
};

it('shows the group description when hovering a group header', async () => {
    renderGroupHeader('Revenue, billing and invoices');
    fireEvent.mouseEnter(screen.getByText('Finance'));
    expect(
        await screen.findByText('Revenue, billing and invoices'),
    ).toBeInTheDocument();
});

it('shows no preview when the group has no description', () => {
    renderGroupHeader();
    fireEvent.mouseEnter(screen.getByText('Finance'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
