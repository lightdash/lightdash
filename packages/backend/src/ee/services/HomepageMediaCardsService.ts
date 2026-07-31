import { type HomepageMediaCard } from '@lightdash/common';
import { BaseService } from '../../services/BaseService';
import { type HomepageMediaCardsModel } from '../models/HomepageMediaCardsModel';

export type HomepageMediaCardsServiceArguments = {
    homepageMediaCardsModel: Pick<HomepageMediaCardsModel, 'list'>;
};

export class HomepageMediaCardsService extends BaseService {
    private readonly homepageMediaCardsModel: HomepageMediaCardsServiceArguments['homepageMediaCardsModel'];

    constructor({
        homepageMediaCardsModel,
    }: HomepageMediaCardsServiceArguments) {
        super();
        this.homepageMediaCardsModel = homepageMediaCardsModel;
    }

    async list(): Promise<HomepageMediaCard[]> {
        return this.homepageMediaCardsModel.list();
    }
}
