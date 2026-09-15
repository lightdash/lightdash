import { type Comment } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../testing/testUtils';
import { CommentDetail } from './CommentDetail';

const comment: Comment = {
    commentId: 'comment-1',
    text: 'Check the January revenue.',
    textHtml: '<p>Check the January revenue.</p>',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    user: {
        name: 'Ada Lovelace',
        userUuid: 'user-1',
        avatarUrl: null,
        avatarGradient: null,
    },
    replyTo: undefined,
    replies: [],
    resolved: false,
    canRemove: true,
    mentions: [],
};

it('supports replying and resolving through named keyboard controls', async () => {
    const user = userEvent.setup();
    const onReply = vi.fn();
    const onResolve = vi.fn();
    renderWithProviders(
        <CommentDetail
            comment={comment}
            canReply
            canResolve
            canRemove
            canUnresolve={false}
            onReply={onReply}
            onResolve={onResolve}
            onRemove={vi.fn()}
        />,
    );

    await user.tab();
    expect(screen.getByRole('button', { name: 'Reply' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onReply).toHaveBeenCalledOnce();
    await user.tab();
    expect(
        screen.getByRole('button', { name: 'Comment actions' }),
    ).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('menuitem', { name: 'Resolve' }));
    expect(onResolve).toHaveBeenCalledOnce();
});

it('keeps read-only comments free of unauthorized action controls', () => {
    renderWithProviders(
        <CommentDetail
            comment={comment}
            canReply={false}
            canResolve={false}
            canRemove={false}
            canUnresolve={false}
            onRemove={vi.fn()}
        />,
    );

    expect(screen.getByText(comment.text)).toBeVisible();
    expect(
        screen.queryByRole('button', { name: 'Reply' }),
    ).not.toBeInTheDocument();
    expect(
        screen.queryByRole('button', { name: 'Comment actions' }),
    ).not.toBeInTheDocument();
});
