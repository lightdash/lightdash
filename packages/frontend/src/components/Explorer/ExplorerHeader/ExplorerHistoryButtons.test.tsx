import { fireEvent, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';
import {
    createExplorerStore,
    explorerActions,
} from '../../../features/explorer/store';
import { renderWithProviders } from '../../../testing/testUtils';
import { ExplorerHistoryButtons } from './ExplorerHistoryButtons';

const setup = () => {
    const store = createExplorerStore();
    store.dispatch(explorerActions.toggleDimension('orders_status'));
    renderWithProviders(
        <Provider store={store}>
            <ExplorerHistoryButtons />
            <input aria-label="text" type="text" />
            <input aria-label="toggle" type="checkbox" />
        </Provider>,
    );
    const dimensions = () =>
        store.getState().explorer.unsavedChartVersion.metricQuery.dimensions;
    return { dimensions };
};

const pressUndo = (target: Element) =>
    fireEvent.keyDown(target, { key: 'z', metaKey: true });

describe('ExplorerHistoryButtons', () => {
    it('undoes and redoes from the keyboard and the buttons', () => {
        const { dimensions } = setup();
        pressUndo(document.body);
        expect(dimensions()).toEqual([]);
        fireEvent.keyDown(document.body, {
            key: 'z',
            metaKey: true,
            shiftKey: true,
        });
        expect(dimensions()).toEqual(['orders_status']);
        fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
        expect(dimensions()).toEqual([]);
        fireEvent.keyDown(document.body, { key: 'y', ctrlKey: true });
        expect(dimensions()).toEqual(['orders_status']);
    });

    it('leaves the keys to text being typed, but not to a toggle that kept focus', () => {
        const { dimensions } = setup();
        pressUndo(screen.getByLabelText('text'));
        expect(dimensions()).toEqual(['orders_status']);
        pressUndo(screen.getByLabelText('toggle'));
        expect(dimensions()).toEqual([]);
    });

    it('leaves the chart alone behind a modal', () => {
        const { dimensions } = setup();
        const modal = document.createElement('div');
        modal.setAttribute('aria-modal', 'true');
        document.body.appendChild(modal);
        pressUndo(modal);
        expect(dimensions()).toEqual(['orders_status']);
        modal.remove();
        pressUndo(document.body);
        expect(dimensions()).toEqual([]);
    });
});
