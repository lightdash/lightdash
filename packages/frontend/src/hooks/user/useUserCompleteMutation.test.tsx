import { Ability } from '@casl/ability';
import { useQueryClient } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import nock from 'nock';
import { describe, expect, it, vi } from 'vitest';
import { BASE_API_URL } from '../../api';
import { renderHookWithProviders } from '../../testing/testUtils';
import { type UserWithAbility } from './useUser';
import { useUserCompleteMutation } from './useUserCompleteMutation';

describe('useUserCompleteMutation', () => {
    it('writes the completed user into the user cache and keeps client-side fields', async () => {
        const { result } = renderHookWithProviders(
            () => ({
                mutation: useUserCompleteMutation(),
                queryClient: useQueryClient(),
            }),
            {
                user: {
                    isSetupComplete: false,
                    organizationName: '',
                },
            },
        );

        await waitFor(() =>
            expect(
                result.current.queryClient.getQueryData<UserWithAbility>([
                    'user',
                ])?.isSetupComplete,
            ).toBe(false),
        );

        const invalidateSpy = vi.spyOn(
            result.current.queryClient,
            'invalidateQueries',
        );

        const scope = nock(BASE_API_URL)
            .patch('/api/v1/user/me/complete')
            .reply(200, {
                status: 'ok',
                results: {
                    isSetupComplete: true,
                    organizationName: 'New organization',
                },
            });

        result.current.mutation.mutate({
            organizationName: 'New organization',
            jobTitle: 'Software Engineer',
            howDidYouHearAboutUs: '',
            enableEmailDomainAccess: false,
            isMarketingOptedIn: true,
            isTrackingAnonymized: false,
        });

        await waitFor(() =>
            expect(result.current.mutation.isSuccess).toBe(true),
        );
        expect(scope.isDone()).toBe(true);

        const cachedUser =
            result.current.queryClient.getQueryData<UserWithAbility>(['user']);
        expect(cachedUser?.isSetupComplete).toBe(true);
        expect(cachedUser?.organizationName).toBe('New organization');
        expect(cachedUser?.ability).toBeInstanceOf(Ability);
        expect(cachedUser?.impersonation).toBeNull();
        expect(invalidateSpy).toHaveBeenCalledWith(['organization']);
        expect(invalidateSpy).not.toHaveBeenCalledWith(['user']);
    });
});
