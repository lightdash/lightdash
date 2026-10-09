import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { AttentionStrip } from './AttentionStrip';

const renderStrip = ({
    unassignedCount = 140,
    sharedCount = 48,
    canManage = true,
}: {
    unassignedCount?: number;
    sharedCount?: number;
    canManage?: boolean;
} = {}) => {
    const onPlace = vi.fn();
    const onReviewShared = vi.fn();
    const result = renderWithProviders(
        <AttentionStrip
            unassignedCount={unassignedCount}
            sharedCount={sharedCount}
            canManage={canManage}
            onPlace={onPlace}
            onReviewShared={onReviewShared}
        />,
    );
    return { ...result, onPlace, onReviewShared };
};

const SHARED_LINK = {
    name: '48 people are in more than one department',
};

describe('AttentionStrip', () => {
    it('says how many people are in no department and links to those in more than one', () => {
        renderStrip();
        expect(
            screen.getByText(
                "140 people are in no department. They aren't counted in any department until you place them",
            ),
        ).toBeVisible();
        expect(screen.getByRole('button', SHARED_LINK)).toBeVisible();
    });

    it('opens placing on people in no department, and the link on people in more than one', async () => {
        const { onPlace, onReviewShared } = renderStrip();
        await userEvent.click(
            screen.getByRole('button', { name: 'Place people' }),
        );
        expect(onPlace).toHaveBeenCalledTimes(1);
        expect(onReviewShared).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole('button', SHARED_LINK));
        expect(onReviewShared).toHaveBeenCalledTimes(1);
        expect(onPlace).toHaveBeenCalledTimes(1);
    });

    it('uses the singular for one person and groups thousands', () => {
        renderStrip({ unassignedCount: 1, sharedCount: 1951 });
        expect(
            screen.getByText(/^1 person is in no department\./),
        ).toBeVisible();
        expect(
            screen.getByRole('button', {
                name: '1,951 people are in more than one department',
            }),
        ).toBeVisible();
    });

    it('shows only the link when nobody is in no department', () => {
        renderStrip({ unassignedCount: 0 });
        expect(screen.getByRole('button', SHARED_LINK)).toBeVisible();
        expect(
            screen.queryByRole('button', { name: 'Place people' }),
        ).not.toBeInTheDocument();
        expect(screen.queryByText(/in no department/)).not.toBeInTheDocument();
    });

    it('interrupts screen readers only when someone is in no department', () => {
        const { unmount } = renderStrip({ unassignedCount: 0 });
        // Information alone is announced politely
        expect(screen.getByRole('status')).toHaveTextContent(
            '48 people are in more than one department',
        );
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        unmount();
        renderStrip();
        expect(screen.getByRole('alert')).toHaveTextContent(
            /^140 people are in no department/,
        );
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('leaves the link out when nobody is in more than one department', () => {
        renderStrip({ sharedCount: 0 });
        expect(
            screen.getByRole('button', { name: 'Place people' }),
        ).toBeVisible();
        expect(
            screen.queryByText(/more than one department/),
        ).not.toBeInTheDocument();
    });

    it('shows nothing when everyone is in exactly one department', () => {
        renderStrip({ unassignedCount: 0, sharedCount: 0 });
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(screen.queryByText(/department/)).not.toBeInTheDocument();
    });

    // jsdom has no layout, so these check the flex rules that keep the button whole at any width
    it('never shrinks the Place people button, and wraps it under the message when the strip is narrow', () => {
        renderStrip();
        const button = screen.getByRole('button', { name: 'Place people' });
        expect(button).toHaveStyle({ flexShrink: '0' });
        const message = screen.getByText(
            /They aren't counted in any department/,
        ).parentElement;
        // The messages give up width down to 16rem, then the button takes a line of its own
        expect(message).toHaveStyle({ flexGrow: '1', flexBasis: '16rem' });
        expect(message?.parentElement).toHaveStyle('--group-wrap: wrap');
        expect(message?.parentElement).toContainElement(button);
    });

    it('offers no button or link to people who cannot place others, and still gives both counts', () => {
        renderStrip({ canManage: false });
        expect(
            screen.getByText(
                /They aren't counted in any department until an admin places them/,
            ),
        ).toBeVisible();
        expect(
            screen.getByText('48 people are in more than one department'),
        ).toBeVisible();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});
