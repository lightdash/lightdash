import { SshKeyPair } from '@lightdash/common';
import { SshKeyPairModel } from '../models/SshKeyPairModel';

type Dependencies = {
    sshKeyPairModel: SshKeyPairModel;
};

export class SshKeyPairService {
    private readonly sshKeyPairModel: SshKeyPairModel;

    constructor({ sshKeyPairModel }: Dependencies) {
        this.sshKeyPairModel = sshKeyPairModel;
    }

    async create(): Promise<Pick<SshKeyPair, 'publicKey'>> {
        const { publicKey } = await this.sshKeyPairModel.create();
        return { publicKey };
    }
}
