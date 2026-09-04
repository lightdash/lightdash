import {
    clearSshPublicKeyDraft,
    readSshPublicKeyDraft,
    writeSshPublicKeyDraft,
} from './sshPublicKeyDraft';

describe('sshPublicKeyDraft', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('returns null when nothing has been drafted', () => {
        expect(readSshPublicKeyDraft('project-a')).toBeNull();
    });

    it('round-trips a drafted key per project', () => {
        writeSshPublicKeyDraft('project-a', 'ssh-rsa AAAA');
        expect(readSshPublicKeyDraft('project-a')).toBe('ssh-rsa AAAA');
        expect(readSshPublicKeyDraft('project-b')).toBeNull();
    });

    it('clears a drafted key', () => {
        writeSshPublicKeyDraft('project-a', 'ssh-rsa AAAA');
        clearSshPublicKeyDraft('project-a');
        expect(readSshPublicKeyDraft('project-a')).toBeNull();
    });

    it('treats an empty draft as absent', () => {
        writeSshPublicKeyDraft('project-a', '');
        expect(readSshPublicKeyDraft('project-a')).toBeNull();
    });

    describe('when storage throws', () => {
        const storage = window.localStorage;

        beforeEach(() => {
            Object.defineProperty(window, 'localStorage', {
                configurable: true,
                get: () => {
                    throw new Error('storage disabled');
                },
            });
        });

        afterEach(() => {
            Object.defineProperty(window, 'localStorage', {
                configurable: true,
                value: storage,
            });
        });

        it('does not throw and reads as absent', () => {
            expect(() =>
                writeSshPublicKeyDraft('project-a', 'ssh-rsa AAAA'),
            ).not.toThrow();
            expect(() => clearSshPublicKeyDraft('project-a')).not.toThrow();
            expect(readSshPublicKeyDraft('project-a')).toBeNull();
        });
    });
});
