import { type AiAgentEvidenceExcerpt } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import {
    cleanExcerptText,
    getRenderableExcerpts,
} from './evidenceExcerptHelpers';
import { EvidenceExcerpts } from './EvidenceExcerpts';

// Render markdown as plain text so assertions match the excerpt source.
vi.mock('../../../../../components/common/AiMarkdown', () => ({
    AiMarkdown: ({ children }: { children: string }) => <div>{children}</div>,
}));

const ex = (
    overrides: Partial<AiAgentEvidenceExcerpt> = {},
): AiAgentEvidenceExcerpt => ({
    source: 'user_prompt',
    text: 'some text',
    redacted: false,
    ...overrides,
});

describe('getRenderableExcerpts', () => {
    it('drops redacted and empty-text excerpts', () => {
        const result = getRenderableExcerpts([
            ex({ text: 'keep me' }),
            ex({ text: 'secret', redacted: true }),
            ex({ text: '   ' }),
            ex({ text: '' }),
        ]);

        expect(result).toEqual([ex({ text: 'keep me' })]);
    });
});

describe('cleanExcerptText', () => {
    it('strips the "previous turn (uuid): prompt=" context prefix', () => {
        expect(
            cleanExcerptText(
                'previous turn (c2869f2f-9ee3-4df9-99bf-95a7c2ef906f): prompt=That revenue is wrong.',
            ),
        ).toBe('That revenue is wrong.');
    });

    it('leaves ordinary text untouched', () => {
        expect(cleanExcerptText('What is our revenue?')).toBe(
            'What is our revenue?',
        );
    });
});

describe('EvidenceExcerpts', () => {
    it('renders a friendly label and text for each renderable excerpt', () => {
        renderWithProviders(
            <EvidenceExcerpts
                excerpts={[
                    ex({ source: 'user_prompt', text: 'What is our revenue?' }),
                    ex({ source: 'assistant_answer', text: 'It is $4,149.12' }),
                    ex({ source: 'next_user_prompt', text: "That's wrong" }),
                ]}
            />,
        );

        expect(screen.getByText('User')).toBeInTheDocument();
        expect(screen.getByText('What is our revenue?')).toBeInTheDocument();
        expect(screen.getByText('Assistant')).toBeInTheDocument();
        expect(screen.getByText('It is $4,149.12')).toBeInTheDocument();
        expect(screen.getByText('User reply')).toBeInTheDocument();
        expect(screen.getByText("That's wrong")).toBeInTheDocument();
    });

    it('renders nothing when there are no renderable excerpts', () => {
        renderWithProviders(
            <EvidenceExcerpts
                excerpts={[ex({ text: 'secret', redacted: true })]}
            />,
        );

        expect(
            screen.queryByTestId('evidence-excerpts'),
        ).not.toBeInTheDocument();
    });
});
