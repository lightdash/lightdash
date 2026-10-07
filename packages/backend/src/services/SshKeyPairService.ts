import {
    assertIsAccountWithOrg,
    assertRegisteredAccount,
    type Account,
    type SshKeyPair,
} from '@lightdash/common';
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

    async create(
        account: Account | undefined,
    ): Promise<Pick<SshKeyPair, 'publicKey'>> {
        assertRegisteredAccount(account);
        assertIsAccountWithOrg(account);
        const { publicKey } = await this.sshKeyPairModel.create(
            account.organization.organizationUuid,
        );
        return { publicKey };
    }
}
