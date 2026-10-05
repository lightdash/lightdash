import {
    getPreviewWarehouseSignInExpiredMessage,
    PersonSignInProvider,
    SignInSubjectBasis,
    type ApiErrorDetail,
} from '@lightdash/common';
import { QueryClient } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import ApiErrorDisplay from './ApiErrorDisplay';
import { sharedSignInSettingsHref } from './sharedSignInSettingsHref';

const embedded = vi.hoisted(() => ({ current: false }));

vi.mock('../../ee/providers/Embed/useIsEmbedded', () => ({
    default: () => embedded.current,
}));

vi.mock('../health/useHealth', () => ({
    default: () => ({ data: undefined }),
}));

const previewError = (data: ApiErrorDetail['data']): ApiErrorDetail => ({
    name: 'PreviewWarehouseSignInExpiredError',
    statusCode: 401,
    message: getPreviewWarehouseSignInExpiredMessage('Production'),
    data,
});

const settingsLink = () =>
    screen.queryByRole('link', { name: 'Open the connection settings' });

it('links to the project in the error instead of the active project', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['user'], { userUuid: 'owner' });
    queryClient.setQueryData(['activeProject', 'owner'], 'another-project');
    expect(
        sharedSignInSettingsHref(
            {
                projectUuid: 'error-project',
                provider: PersonSignInProvider.GOOGLE,
                subjectUserUuid: 'owner',
                subjectName: 'Owner',
                subjectBasis: SignInSubjectBasis.RECORDED,
            },
            queryClient,
        ),
    ).toBe('/generalSettings/projectManagement/error-project/settings');
});

describe('ApiErrorDisplay for an expired preview sign-in', () => {
    beforeEach(() => {
        embedded.current = false;
    });

    it('links to the parent project connection settings', () => {
        renderWithProviders(
            <ApiErrorDisplay
                apiError={previewError({
                    upstreamProjectUuid: 'upstream-project-uuid',
                    upstreamProjectName: 'Production',
                })}
            />,
        );

        expect(
            screen.getByText(
                "This preview's warehouse sign-in expired. Reconnect the warehouse on Production.",
                { exact: false },
            ),
        ).toBeInTheDocument();
        expect(settingsLink()).toHaveAttribute(
            'href',
            '/generalSettings/projectManagement/upstream-project-uuid/settings',
        );
    });

    it('shows no link when the error does not name the parent project', () => {
        renderWithProviders(<ApiErrorDisplay apiError={previewError({})} />);

        expect(settingsLink()).not.toBeInTheDocument();
    });

    it('shows no link in an embed', () => {
        embedded.current = true;

        renderWithProviders(
            <ApiErrorDisplay
                apiError={previewError({
                    upstreamProjectUuid: 'upstream-project-uuid',
                })}
            />,
        );

        expect(settingsLink()).not.toBeInTheDocument();
    });
});
