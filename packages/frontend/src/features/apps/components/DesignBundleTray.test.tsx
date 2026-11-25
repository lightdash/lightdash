import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import DesignBundleTray from './DesignBundleTray';

const chips = [
    { bubbleId: 'a', label: 'Bubble 1 · ① · "bigger"' },
    { bubbleId: 'b', label: 'Bubble 2 · "darker"' },
];

describe('DesignBundleTray', () => {
    it('shows one chip per bundled bubble and sends them all', () => {
        const onSendAll = vi.fn();
        const onRemove = vi.fn();
        renderWithProviders(
            <DesignBundleTray
                chips={chips}
                busy={false}
                waiting={false}
                onRemove={onRemove}
                onSendAll={onSendAll}
            />,
        );
        expect(screen.getByText('Bubble 1 · ① · "bigger"')).toBeInTheDocument();
        expect(screen.getByText('Bubble 2 · "darker"')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Send all' }));
        expect(onSendAll).toHaveBeenCalledTimes(1);

        fireEvent.click(
            screen.getByRole('button', { name: 'Remove Bubble 2 · "darker"' }),
        );
        expect(onRemove).toHaveBeenCalledWith('b');
    });

    it('reads "Send when ready" while a build runs', () => {
        renderWithProviders(
            <DesignBundleTray
                chips={chips}
                busy
                waiting={false}
                onRemove={vi.fn()}
                onSendAll={vi.fn()}
            />,
        );
        expect(
            screen.getByRole('button', { name: 'Send when ready' }),
        ).toBeEnabled();
        expect(
            screen.queryByRole('button', { name: 'Send all' }),
        ).not.toBeInTheDocument();
    });

    it('shows that the bundle is waiting for the build', () => {
        renderWithProviders(
            <DesignBundleTray
                chips={chips}
                busy
                waiting
                onRemove={vi.fn()}
                onSendAll={vi.fn()}
            />,
        );
        expect(
            screen.getByRole('button', { name: 'Send when ready' }),
        ).toBeDisabled();
        expect(screen.getByText('Sends when the build finishes')).toBeVisible();
    });

    it('renders nothing with no bubbles', () => {
        renderWithProviders(
            <DesignBundleTray
                chips={[]}
                busy={false}
                waiting={false}
                onRemove={vi.fn()}
                onSendAll={vi.fn()}
            />,
        );
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});
