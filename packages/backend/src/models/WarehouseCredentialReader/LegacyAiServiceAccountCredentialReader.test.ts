import {
    ParameterError,
    WarehouseTypes,
    type AiServiceAccountSlot,
} from '@lightdash/common';
import { type AiServiceAccountSecrets } from '../AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';
import { LegacyAiServiceAccountCredentialReader } from './LegacyAiServiceAccountCredentialReader';

const secrets: AiServiceAccountSecrets = Object.freeze({
    type: WarehouseTypes.POSTGRES,
    user: '__NOT_A_USER__',
    password: '__NOT_A_SECRET__',
});
const slot: AiServiceAccountSlot = Object.freeze({
    uuid: 'slot-uuid',
    identityUuid: 'generation-uuid',
    projectUuid: 'project-uuid',
    warehouseConnectionUuid: 'connection-uuid',
    kind: 'ai_service_account',
    scope: 'connection',
    warehouseType: WarehouseTypes.POSTGRES,
    method: 'password',
    createdByUserUuid: null,
    updatedByUserUuid: null,
    credentialSubjectUserUuid: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
});
const sentinel = Object.freeze({ slot, secrets });
const setup = () => {
    const model = {
        getSecrets: vi.fn().mockResolvedValue(sentinel),
        getReplaceableSecrets: vi.fn().mockResolvedValue(secrets),
    };
    return {
        model,
        reader: new LegacyAiServiceAccountCredentialReader({
            aiServiceAccountCredentialsModel: model,
        }),
    };
};

describe('readSlotWithSecrets', () => {
    test.each(['connection-uuid', null])(
        'preserves the object and exact arguments for %s',
        async (connection) => {
            const { model, reader } = setup();
            const read = await reader.readSlotWithSecrets(
                'project-uuid',
                connection,
            );
            expect(read).toBe(sentinel);
            expect(model.getSecrets).toHaveBeenCalledTimes(1);
            expect(model.getSecrets.mock.calls[0]).toEqual([
                'project-uuid',
                connection,
                true,
            ]);
            expect(model.getReplaceableSecrets).not.toHaveBeenCalled();
        },
    );

    test('preserves a missing row', async () => {
        const { model, reader } = setup();
        model.getSecrets.mockResolvedValue(null);
        const read = await reader.readSlotWithSecrets('project-uuid', null);
        expect(read).toBeNull();
        expect(model.getSecrets).toHaveBeenCalledTimes(1);
        expect(model.getReplaceableSecrets).not.toHaveBeenCalled();
    });

    test('preserves the error instance', async () => {
        const { model, reader } = setup();
        const error = new ParameterError('sentinel');
        model.getSecrets.mockRejectedValue(error);
        await expect(
            reader.readSlotWithSecrets('project-uuid', null),
        ).rejects.toBe(error);
        expect(model.getSecrets).toHaveBeenCalledTimes(1);
        expect(model.getReplaceableSecrets).not.toHaveBeenCalled();
    });

    test('returns the promise of the model', () => {
        const { model, reader } = setup();
        const promise = Promise.resolve(sentinel);
        model.getSecrets.mockReturnValue(promise);
        expect(reader.readSlotWithSecrets('project-uuid', null)).toBe(promise);
    });
});

describe('readReplaceableSecrets', () => {
    test.each(['connection-uuid', null])(
        'preserves the object and exact arguments for %s',
        async (connection) => {
            const { model, reader } = setup();
            const read = await reader.readReplaceableSecrets(
                'project-uuid',
                connection,
            );
            expect(read).toBe(secrets);
            expect(model.getReplaceableSecrets).toHaveBeenCalledTimes(1);
            expect(model.getReplaceableSecrets.mock.calls[0]).toHaveLength(2);
            expect(model.getReplaceableSecrets.mock.calls[0]).toEqual([
                'project-uuid',
                connection,
            ]);
            expect(model.getSecrets).not.toHaveBeenCalled();
        },
    );

    test('preserves a missing row', async () => {
        const { model, reader } = setup();
        model.getReplaceableSecrets.mockResolvedValue(null);
        const read = await reader.readReplaceableSecrets('project-uuid', null);
        expect(read).toBeNull();
        expect(model.getReplaceableSecrets).toHaveBeenCalledTimes(1);
        expect(model.getSecrets).not.toHaveBeenCalled();
    });

    test('preserves the error instance', async () => {
        const { model, reader } = setup();
        const error = new ParameterError('sentinel');
        model.getReplaceableSecrets.mockRejectedValue(error);
        await expect(
            reader.readReplaceableSecrets('project-uuid', null),
        ).rejects.toBe(error);
        expect(model.getReplaceableSecrets).toHaveBeenCalledTimes(1);
        expect(model.getSecrets).not.toHaveBeenCalled();
    });

    test('returns the promise of the model', () => {
        const { model, reader } = setup();
        const promise = Promise.resolve(secrets);
        model.getReplaceableSecrets.mockReturnValue(promise);
        expect(reader.readReplaceableSecrets('project-uuid', null)).toBe(
            promise,
        );
    });
});
