import { type AiPromptContextItem } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { type ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { PinnedReviewEntityCard } from './PinnedReviewEntityCard';

type ReviewEntityItem = Extract<
    AiPromptContextItem,
    {
        type:
            | 'pull_request'
            | 'proposed_change'
            | 'review_finding'
            | 'preview_environment';
    }
>;

const renderCard = (item: ReviewEntityItem): ReactElement =>
    renderWithProviders(
        <MemoryRouter>
            <PinnedReviewEntityCard item={item} />
        </MemoryRouter>,
    ) as unknown as ReactElement;

describe('PinnedReviewEntityCard', () => {
    it('renders a pull request card with number, status badge and title', () => {
        renderCard({
            type: 'pull_request',
            prUrl: 'https://github.com/acme/repo/pull/123',
            prNumber: 123,
            provider: null,
            status: 'open',
            title: 'Add weekly_active_users',
        });

        expect(screen.getByText('PR #123')).toBeInTheDocument();
        expect(screen.getByText('open')).toBeInTheDocument();
        expect(screen.getByText('Add weekly_active_users')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'PR #123' })).toHaveAttribute(
            'href',
            'https://github.com/acme/repo/pull/123',
        );
    });

    it('renders a project-context proposed change card with the entry content', () => {
        renderCard({
            type: 'proposed_change',
            fingerprint: 'fp-1',
            payload: {
                changeKind: 'project_context',
                entry: {
                    op: 'create',
                    id: null,
                    kind: 'definition',
                    content: 'Active user = signed in within 28 days',
                    terms: ['active user'],
                    objects: [],
                },
            },
        });

        expect(screen.getByText('Proposed change')).toBeInTheDocument();
        expect(
            screen.getByText('Active user = signed in within 28 days'),
        ).toBeInTheDocument();
    });

    it('renders a semantic-layer proposed change card with the recommendation title', () => {
        renderCard({
            type: 'proposed_change',
            fingerprint: 'fp-2',
            payload: {
                changeKind: 'semantic_layer',
                recommendation: {
                    actionType: 'update_semantic_yaml',
                    title: 'Add weekly_active_users metric',
                    rationale: 'Users keep asking for it',
                    targetRefs: [],
                },
            },
        });

        expect(
            screen.getByText('Add weekly_active_users metric'),
        ).toBeInTheDocument();
    });

    it('renders a finding card with title, root-cause badge and frequency', () => {
        renderCard({
            type: 'review_finding',
            fingerprint: 'fp-3',
            title: 'No metric for weekly active users',
            rootCause: 'semantic_layer',
            findingCount: 8,
            evidenceExcerpts: [],
        });

        expect(
            screen.getByText('No metric for weekly active users'),
        ).toBeInTheDocument();
        expect(screen.getByText('Semantic layer')).toBeInTheDocument();
        expect(screen.getByText('8×')).toBeInTheDocument();
    });

    it('shows [redacted] for redacted evidence and never its raw text', () => {
        renderCard({
            type: 'review_finding',
            fingerprint: 'fp-4',
            title: 'Sensitive finding',
            rootCause: 'project_context',
            findingCount: 1,
            evidenceExcerpts: [
                {
                    source: 'user_prompt',
                    text: 'secret raw value',
                    redacted: true,
                },
                {
                    source: 'assistant_answer',
                    text: 'visible excerpt',
                    redacted: false,
                },
            ],
        });

        expect(screen.getByText('[redacted]')).toBeInTheDocument();
        expect(screen.getByText('visible excerpt')).toBeInTheDocument();
        expect(screen.queryByText('secret raw value')).not.toBeInTheDocument();
    });

    it('renders a preview environment card linking to the thread when present', () => {
        renderCard({
            type: 'preview_environment',
            previewProjectUuid: 'proj-1',
            previewThreadUuid: 'thread-1',
            status: 'preview_ready',
            projectName: 'Preview: Jaffle',
        });

        expect(screen.getByText('Preview: Jaffle')).toBeInTheDocument();
        expect(screen.getByText('preview_ready')).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Preview: Jaffle' }),
        ).toHaveAttribute(
            'href',
            '/projects/proj-1/ai-agents/threads/thread-1',
        );
    });
});
