import { EncryptionService } from './EncryptionService';

test('Message is unchanged by encryption and decryption', () => {
    const service = new EncryptionService({
        lightdashConfig: { lightdashSecret: 'secret' },
    });
    const message = 'extremely secret';
    expect(service.decrypt(service.encrypt(message))).toStrictEqual(message);
});
