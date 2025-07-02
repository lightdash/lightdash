import {
    AlreadyExistsError,
} from '@lightdash/common';
import { Knex } from 'knex';
import { DbShop, ShopTableName } from '../database/entities/shopifyShop';

type ShopModelArguments = {
    database: Knex;
};

export class ShopModel {
    private readonly database: Knex;

    constructor({ database }: ShopModelArguments) {
        this.database = database;
    }

    async create(data: any): Promise<DbShop> {
        const existing = await this.database(ShopTableName)
            .where('shop_url', data.shop_url)
            .first();

        if (existing) {
            // TODO: If shop already exists and no user associate direct to registration.
            //       Otherwise direct to login.
            throw new AlreadyExistsError(`Shop ${data.shop_url} already exists`);
        }

        const [created] = await this.database<DbShop>(ShopTableName)
            .insert({
                ...data,
                updated_at: this.database.fn.now(),
            })
            .returning('*');

        return created;
    }

    async getByShopUrl(shopUrl: string): Promise<DbShop | undefined> {
        return this.database<DbShop>(ShopTableName)
            .where('shop_url', shopUrl)
            .first();
    }

    async updateByShopUrl(
        shopUrl: string,
        updates: Partial<Omit<DbShop, 'shop_id' | 'shop_uuid' | 'created_at'>>,
    ): Promise<DbShop> {
        const [updated] = await this.database<DbShop>(ShopTableName)
            .where('shop_url', shopUrl)
            .update({
                ...updates,
                updated_at: this.database.fn.now(),
            })
            .returning('*');

        return updated;
    }
}
