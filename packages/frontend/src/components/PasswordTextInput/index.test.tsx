import { MantineProvider, TextInput } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import PasswordTextInput from '.';

describe('PasswordTextInput', () => {
    it('shows every public password requirement when focused', async () => {
        render(
            <MantineProvider env="test">
                <PasswordTextInput passwordValue="short">
                    <TextInput aria-label="Password" />
                </PasswordTextInput>
            </MantineProvider>,
        );

        fireEvent.focus(screen.getByLabelText('Password'));

        expect(
            await screen.findByText('must be at least 8 characters long'),
        ).toBeInTheDocument();
        expect(screen.getByText('must contain a letter')).toBeInTheDocument();
        expect(
            screen.getByText('must contain a number or symbol'),
        ).toBeInTheDocument();
    });
});
