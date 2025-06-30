import { Knex } from 'knex';

export type DbShop = {
    shop_id: number;
    shop_uuid: string;
    user_uuid: string | null; // foreign key to users table

    name: string;
    shop_url: string;
    domains: string[] | null;
    access_token: string;
    subscription_id: string | null;

    subscription_period_start: Date;
    subscription_period_end: Date | null;

    is_first_login: boolean;
    is_uninstalled: boolean;
    is_beta: boolean;

    created_at: Date;
    updated_at: Date;
};

export type DbShopIn = Omit<
    DbShop,
    'shop_id' | 'shop_uuid' | 'created_at' | 'updated_at'
> & Partial<Pick<DbShop, 'shop_uuid'>>;

export type DbShopUpdate = Partial<
    Omit<DbShop, 'shop_id' | 'shop_uuid' | 'created_at'>
> & { updated_at?: Date };

export type ShopTable = Knex.CompositeTableType<DbShop, DbShopIn, DbShopUpdate>;

export const ShopTableName = 'shopify_shops';
