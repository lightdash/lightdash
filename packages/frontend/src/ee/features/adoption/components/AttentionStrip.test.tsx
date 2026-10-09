import { screen, within } from '@testing-library/react';
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
// The page header has the Place people button; the strip links from its sentence instead
const PLACE_LINK = { name: 'place them' };
const UNASSIGNED =
    "140 people are in no department. They aren't counted in any department until you place them";

// The unassigned sentence, whole, with its link inside it
const unassignedSentence = () =>
    screen.getByText(
        (_, element) =>
            element?.tagName === 'P' && element.textContent === UNASSIGNED,
    );

describe('AttentionStrip', () => {
    it('says how many people are in no department, links its last words to placing them, and links to those in more than one', () => {
        renderStrip();
        expect(unassignedSentence()).toBeVisible();
        expect(
            within(unassignedSentence()).getByRole('button', PLACE_LINK),
        ).toBeVisible();
        expect(screen.getByRole('button', SHARED_LINK)).toBeVisible();
    });

    it('opens placing on people in no department from the sentence, and on people in more than one from their link', async () => {
        const { onPlace, onReviewShared } = renderStrip();
        await userEvent.click(screen.getByRole('button', PLACE_LINK));
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
            screen.queryByRole('button', PLACE_LINK),
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
        expect(screen.getByRole('button', PLACE_LINK)).toBeVisible();
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

    it('has no button of its own, as the page header has Place people: only the two links', () => {
        renderStrip();
        expect(
            screen.queryByRole('button', { name: 'Place people' }),
        ).not.toBeInTheDocument();
        expect(
            screen.getAllByRole('button').map((control) => control.textContent),
        ).toEqual(['place them', '48 people are in more than one department']);
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
