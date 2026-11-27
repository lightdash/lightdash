import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Security from './Security';

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock('../features/securityContacts/useSecurityContacts', () => ({
    useSecurityContacts: () => ({
        emails: [],
        isLoading: false,
        isNotConfigured: false,
    }),
    useUpdateSecurityContacts: () => ({ mutate, isLoading: false }),
}));

const renderPage = () =>
    render(
        <MantineProvider env="test">
            <Security />
        </MantineProvider>,
    );

const field = () =>
    screen
        .getAllByLabelText('Security contact email addresses')
        .find(
            (element): element is HTMLInputElement =>
                element instanceof HTMLInputElement &&
                element.type !== 'hidden',
        )!;

describe('Security contacts field', () => {
    beforeEach(() => mutate.mockClear());

    it('keeps a half-typed address when the field commits early', async () => {
        const user = userEvent.setup();
        renderPage();

        await user.type(field(), 'security@lightdash');
        // Leaving the field commits whatever is in it.
        await user.tab();

        expect(field()).toHaveValue('security@lightdash');
        expect(
            screen.getByText(
                "'security@lightdash' doesn't appear to be an email address",
            ),
        ).toBeInTheDocument();

        await user.click(field());
        await user.type(field(), '.com{Enter}');

        expect(field()).toHaveValue('');
        expect(screen.getByText('security@lightdash.com')).toBeInTheDocument();
        expect(
            screen.queryByText(/doesn't appear to be an email address/),
        ).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Save' }));
        expect(mutate).toHaveBeenCalledWith(['security@lightdash.com']);
    });

    it('keeps the invalid part and adds the valid ones on a separator', async () => {
        const user = userEvent.setup();
        renderPage();

        await user.type(field(), 'Ops@Example.com,');
        expect(screen.getByText('ops@example.com')).toBeInTheDocument();
        expect(field()).toHaveValue('');

        await user.type(field(), 'not-an-email,');
        expect(field()).toHaveValue('not-an-email');
        expect(screen.getByText('ops@example.com')).toBeInTheDocument();
    });
});
