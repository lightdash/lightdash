import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GuideChecklist } from './GuideChecklist';
import { GuideLimitations, GuideOverview } from './GuideOverview';
import { SessionCeilingStep } from './SessionCeilingStep';
import { type BoundaryGuide } from './useBoundaryGuide';

vi.mock('./GuideSection', () => ({
    GuideSection: ({
        id,
        title,
        mark,
    }: {
        id: string;
        title: string;
        mark: { name: string } | null | undefined;
    }) => (
        <div data-testid="guide-section" data-section={id}>
            {title} {mark?.name}
        </div>
    ),
}));

const renderGuide = (component: ReactNode) =>
    render(<MantineProvider>{component}</MantineProvider>);

describe('Snowflake AI boundary guide content', () => {
    it('puts masking before the session scope and keeps saved marks by step ID', () => {
        const guide = {
            config: {
                data: {
                    state: {
                        marks: {
                            masking: { name: 'Masking Admin' },
                            session_policy: { name: 'Scope Admin' },
                        },
                    },
                    statuses: {},
                    signedInMemberCount: 0,
                    memberCount: 0,
                },
            },
            inputs: {},
            mark: { isLoading: false },
        } as unknown as BoundaryGuide;
        renderGuide(
            <GuideChecklist
                guide={guide}
                opened={[]}
                onToggle={vi.fn()}
                onFix={vi.fn()}
            />,
        );
        const sections = screen.getAllByTestId('guide-section');
        expect(sections.map((section) => section.dataset.section)).toEqual([
            'prerequisites',
            'oauth',
            'masking',
            'session_policy',
            'sign_in',
            'checks',
        ]);
        expect(sections[2]).toHaveTextContent('Masking Admin');
        expect(sections[3]).toHaveTextContent('Scope Admin');
    });

    it('describes masking as the main control and states the scope limits', () => {
        renderGuide(
            <>
                <GuideOverview />
                <SessionCeilingStep sql="SELECT 1;" />
                <GuideLimitations />
            </>,
        );
        expect(screen.getByText(/IS_AGENT_ACTIVATED/)).toBeInTheDocument();
        expect(
            screen.getByText(/session scope adds a second layer/),
        ).toBeInTheDocument();
        expect(
            screen.getAllByText(
                /session scope does not stop a view in an allowed schema from reading an excluded schema/,
            ),
        ).toHaveLength(2);
        expect(
            screen.getByText(
                (_, element) =>
                    element?.tagName === 'SPAN' &&
                    element.textContent?.includes(
                        'session scope does not block RESULT_SCAN',
                    ) === true,
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                (_, element) =>
                    element?.tagName === 'SPAN' &&
                    element.textContent?.includes(
                        'Raw SQL from AI stays off.',
                    ) === true,
            ),
        ).toBeInTheDocument();
    });
});
