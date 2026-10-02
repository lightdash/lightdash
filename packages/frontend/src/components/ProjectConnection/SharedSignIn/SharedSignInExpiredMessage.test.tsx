import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SharedSignInExpiredMessage } from './SharedSignInExpiredMessage';

describe('SharedSignInExpiredMessage', () => {
    it('renders a reconnect link without app or router context', () => {
        render(
            <MantineProvider env="test">
                <SharedSignInExpiredMessage
                    message="The shared sign-in has expired."
                    settingsHref="/generalSettings/projectManagement/project-1/settings"
                />
            </MantineProvider>,
        );

        expect(
            screen.getByText('The shared sign-in has expired.'),
        ).toBeVisible();
        expect(screen.getByRole('link', { name: 'Reconnect' })).toHaveAttribute(
            'href',
            '/generalSettings/projectManagement/project-1/settings',
        );
    });

    it('omits the link when there is no subject settings URL', () => {
        render(
            <MantineProvider env="test">
                <SharedSignInExpiredMessage
                    message="Ask a project admin to reconnect."
                    settingsHref={null}
                />
            </MantineProvider>,
        );

        expect(
            screen.getByText('Ask a project admin to reconnect.'),
        ).toBeVisible();
        expect(screen.queryByRole('link')).toBeNull();
    });
});
