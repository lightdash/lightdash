import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { MaskingStep } from './MaskingStep';
import { useBoundaryGuide } from './useBoundaryGuide';

vi.mock('../../api', () => ({ lightdashApi: vi.fn().mockResolvedValue({}) }));
vi.mock('../../features/sqlRunner/hooks/useTables', () => ({
    useTables: () => ({
        data: { DB: { PUBLIC: {}, PII_PEOPLE: {} } },
        isInitialLoading: false,
        isError: false,
    }),
}));
vi.mock('../../hooks/useProject', () => ({
    useAiAccessRestrictions: () => ({ data: null }),
    useProjectUpdateAiAccessRestrictions: () => ({}),
}));
const Guide = () => {
    const guide = useBoundaryGuide({
        projectUuid: 'project',
        isSnowflake: false,
        showAiAccessRestrictions: false,
    });
    return (
        <>
            <MaskingStep guide={guide} />
            <output aria-label="Protected schema names">
                {guide.protectedSchemas.map((schema) => schema.label).join(',')}
            </output>
        </>
    );
};
it('protects the allowed set and generates masking SQL only after an explicit rule', async () => {
    render(
        <MantineProvider env="test">
            <QueryClientProvider client={new QueryClient()}>
                <Guide />
            </QueryClientProvider>
        </MantineProvider>,
    );
    expect(
        screen.getByLabelText('Patterns', { selector: 'input' }),
    ).toHaveValue('');
    expect(
        screen.getByLabelText('Protected schema names'),
    ).toBeEmptyDOMElement();
    fireEvent.click(
        screen.getByLabelText('Protected schemas', { selector: 'input' }),
    );
    expect(
        screen.queryByRole('option', { name: 'Use an existing role' }),
    ).not.toBeInTheDocument();
    await userEvent.click(
        await screen.findByRole('option', {
            name: 'Only schemas whose names match',
        }),
    );
    fireEvent.click(screen.getByLabelText('Database', { selector: 'input' }));
    await userEvent.click(await screen.findByRole('option', { name: 'DB' }));
    await userEvent.type(
        screen.getByLabelText('Patterns', { selector: 'input' }),
        'PII_*{enter}',
    );
    expect(screen.getByLabelText('Protected schema names')).toHaveTextContent(
        /^DB.PII_PEOPLE$/,
    );
    fireEvent.click(
        screen.getByLabelText('Tag database', { selector: 'input' }),
    );
    await userEvent.click(await screen.findByRole('option', { name: 'DB' }));
    fireEvent.click(screen.getByLabelText('Tag schema', { selector: 'input' }));
    await userEvent.click(
        await screen.findByRole('option', { name: 'PUBLIC' }),
    );
    expect(screen.getByText(/then tags 1 schemas/)).toBeInTheDocument();
    expect(
        screen.getByText(/ALTER SCHEMA "DB"\."PII_PEOPLE"/),
    ).toBeInTheDocument();
});
