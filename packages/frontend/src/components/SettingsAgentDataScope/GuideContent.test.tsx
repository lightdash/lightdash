import { getAiQueryProcedureSql } from '@lightdash/common';
import { Box, MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GuideChecklist } from './GuideChecklist';
import { GuideLimitations, GuideOverview } from './GuideOverview';
import { SessionCeilingStep } from './SessionCeilingStep';
import { type BoundaryGuide } from './useBoundaryGuide';
import { useGuideSql } from './useGuideSql';

vi.mock('./GuideSection', () => ({
    GuideSection: ({
        id,
        title,
        mark,
        children,
    }: {
        children: ReactNode;
        id: string;
        title: string;
        mark: { name: string } | null | undefined;
    }) => (
        <Box data-testid="guide-section" data-section={id}>
            {title} {mark?.name}
            {id === 'query_procedure' ? children : null}
        </Box>
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
                /session scope does not cover views in allowed schemas that read excluded schemas/,
            ),
        ).toHaveLength(2);
        expect(
            screen.getAllByText(
                /Copies of personal data outside the protected schemas are not protected/,
            ),
        ).toHaveLength(2);
        expect(
            screen.getAllByText(
                (_, element) =>
                    (element?.tagName === 'LI' || element?.tagName === 'P') &&
                    element.textContent?.includes(
                        "The session scope does not block RESULT_SCAN from reading the same person's earlier query results.",
                    ) === true,
            ),
        ).toHaveLength(2);
    });
});

const ProcedureGuide = ({ enabled }: { enabled: boolean }) => {
    const inputs = {
        integrationName: '',
        roles: 'ANALYST',
        tagDatabase: 'DATA',
        tagSchema: 'SECURITY',
        procedureDatabase: 'ANALYTICS',
        procedureSchema: 'AI_GOVERNANCE',
        procedureName: 'LIGHTDASH_AI_RUN_SQL',
        procedureOwnerRole: 'OWNER',
        allowedSchemas: ['public'],
    };
    const sql = useGuideSql({
        ...inputs,
        aiQueryProcedureEnabled: enabled,
        redirectUri: '',
        account: '',
        protectedSchemas: [],
        allowedSchemas: [{ database: 'DATA', schema: 'PUBLIC' }],
    });
    const guide = {
        config: { data: { state: { marks: {} }, statuses: {} } },
        aiQueryProcedureEnabled: enabled,
        inputs,
        setInputs: vi.fn(),
        mark: { isLoading: false },
        catalogQuery: { isInitialLoading: false, isError: false },
        schemas: [
            {
                database: 'DATA',
                schema: 'PUBLIC',
                key: 'public',
                label: 'DATA.PUBLIC',
            },
        ],
        ...sql,
    } as unknown as BoundaryGuide;
    return (
        <GuideChecklist
            guide={guide}
            opened={['query_procedure']}
            onToggle={vi.fn()}
            onFix={vi.fn()}
        />
    );
};

vi.mock('./SqlPanel', () => ({
    SqlPanel: ({ sql }: { sql: string }) => (
        <Box data-testid="sql-panel">{sql}</Box>
    ),
}));

describe('AI query procedure guide step', () => {
    it('shows generated SQL and the setting value with the flag on', () => {
        renderGuide(<ProcedureGuide enabled />);
        expect(screen.getByText('AI query procedure')).toBeInTheDocument();
        expect(screen.getByTestId('sql-panel').textContent).toBe(
            getAiQueryProcedureSql({
                database: 'ANALYTICS',
                schema: 'AI_GOVERNANCE',
                name: 'LIGHTDASH_AI_RUN_SQL',
                ownerRole: 'OWNER',
                aiRoles: ['ANALYST'],
                allowedSchemas: [{ database: 'DATA', schema: 'PUBLIC' }],
            }),
        );
        expect(
            screen.getByText(
                '"ANALYTICS"."AI_GOVERNANCE"."LIGHTDASH_AI_RUN_SQL"',
            ),
        ).toBeInTheDocument();
        expect(screen.getByLabelText('AI roles')).toHaveValue('ANALYST');
    });

    it('hides the step with the flag off', () => {
        renderGuide(<ProcedureGuide enabled={false} />);
        expect(
            screen.queryByText('AI query procedure'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByLabelText('Procedure name'),
        ).not.toBeInTheDocument();
    });
});
