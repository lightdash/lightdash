import { HeadlessBrowserLoginGrantModel } from '../models/HeadlessBrowserLoginGrantModel';
import { BaseService } from './BaseService';

type HeadlessBrowserServiceArguments = {
    headlessBrowserLoginGrantModel: HeadlessBrowserLoginGrantModel;
};

export class HeadlessBrowserService extends BaseService {
    private readonly headlessBrowserLoginGrantModel: HeadlessBrowserLoginGrantModel;

    constructor({
        headlessBrowserLoginGrantModel,
    }: HeadlessBrowserServiceArguments) {
        super();
        this.headlessBrowserLoginGrantModel = headlessBrowserLoginGrantModel;
    }

    async consumeLoginGrant(token: string): Promise<string | null> {
        return this.headlessBrowserLoginGrantModel.consumeLoginGrant(token);
    }
}
