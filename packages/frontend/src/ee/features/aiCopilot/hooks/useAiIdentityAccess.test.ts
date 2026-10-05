import { AiIdentityState, type AiAccessForUser } from '@lightdash/common';
import { waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../../api';
import { renderHookWithProviders } from '../../../../testing/testUtils';
import {
    isAiIdentityBlocked,
    useAiIdentityAccess,
} from './useAiIdentityAccess';

vi.mock('../../../../api', () => ({ lightdashApi: vi.fn() }));
const access: AiAccessForUser = {
    projectUuid: 'project',
    restrictionsOn: true,
    warehouseType: 'snowflake',
    aiIdentityRequired: true,
    state: AiIdentityState.PENDING,
    aiIdentityName: null,
    lastCheckedAt: null,
    action: 'ask_admin',
    message: null,
    rawSqlAllowed: false,
};

it('loads access from the v2 person endpoint for the project', async () => {
    vi.mocked(lightdashApi).mockResolvedValue(access);
    const { result } = renderHookWithProviders(() =>
        useAiIdentityAccess('project'),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lightdashApi).toHaveBeenCalledWith({
        version: 'v2',
        url: '/user/me/ai-access?projectUuid=project',
        method: 'GET',
        body: undefined,
    });
    expect(isAiIdentityBlocked(result.current.data)).toBe(true);
});

it.each([
    AiIdentityState.PENDING,
    AiIdentityState.FAILED,
    AiIdentityState.NEEDS_SIGN_IN,
    null,
])('blocks %s under restrictions', (state) => {
    expect(isAiIdentityBlocked({ ...access, state })).toBe(true);
});

it('allows ready identities and unrestricted projects', () => {
    expect(
        isAiIdentityBlocked({ ...access, state: AiIdentityState.READY }),
    ).toBe(false);
    expect(isAiIdentityBlocked({ ...access, aiIdentityRequired: false })).toBe(
        false,
    );
});
