import { SshKeyPair } from '@lightdash/common';
import { SshKeyPairModel } from '../models/SshKeyPairModel';
import { BaseService } from './BaseService';

type SshKeyPairServiceArguments = {
    sshKeyPairModel: SshKeyPairModel;
};

export class SshKeyPairService extends BaseService {
    private readonly sshKeyPairModel: SshKeyPairModel;

    constructor({ sshKeyPairModel }: SshKeyPairServiceArguments) {
        super();
        this.sshKeyPairModel = sshKeyPairModel;
    }

    async create(): Promise<Pick<SshKeyPair, 'publicKey'>> {
        const { publicKey } = await this.sshKeyPairModel.create();
        return { publicKey };
    }
}
