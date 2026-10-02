import {
    WarehouseTypes,
    type CreatePostgresCredentials,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { normaliseCredentialSource } from './WarehouseConnectionService';

const user = { userUuid: 'user-uuid', organizationUuid: 'org-uuid' };

const credentials = {
    type: WarehouseTypes.POSTGRES,
    host: ' db.example.com ',
} as CreatePostgresCredentials;

describe('normaliseCredentialSource', () => {
    it('passes project credentials through the credential policy', async () => {
        const policy = {
            normaliseWarehouseConnectionInput: async <
                T extends CreateWarehouseCredentials,
            >(
                _user: typeof user,
                input: T,
            ) => ({ ...input, host: 'db.example.com' }) as T,
        };
        const normaliseWarehouseConnectionInput = vi.spyOn(
            policy,
            'normaliseWarehouseConnectionInput',
        );
        const source = await normaliseCredentialSource(policy, user, {
            kind: 'project',
            credentials,
        });
        expect(normaliseWarehouseConnectionInput).toHaveBeenCalledWith(
            user,
            credentials,
        );
        expect(source).toEqual({
            kind: 'project',
            credentials: { ...credentials, host: 'db.example.com' },
        });
    });

    it('leaves an organization credential reference unchanged', async () => {
        const normaliseWarehouseConnectionInput = vi.fn();
        const source = {
            kind: 'organization' as const,
            organizationWarehouseCredentialsUuid: 'credentials-uuid',
        };
        await expect(
            normaliseCredentialSource(
                { normaliseWarehouseConnectionInput },
                user,
                source,
            ),
        ).resolves.toBe(source);
        expect(normaliseWarehouseConnectionInput).not.toHaveBeenCalled();
    });

    it('stops on input that needs confirmation', async () => {
        const normaliseWarehouseConnectionInput = vi
            .fn()
            .mockRejectedValue(new Error('Check the warehouse connection'));
        await expect(
            normaliseCredentialSource(
                { normaliseWarehouseConnectionInput },
                user,
                {
                    kind: 'project',
                    credentials,
                },
            ),
        ).rejects.toThrow('Check the warehouse connection');
    });
});
