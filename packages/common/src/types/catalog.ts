import { type Explore } from './explore';
import { type Field } from './field';

export type ApiCatalogSearch = {
    search?: string;
    onlyTables?: boolean;
    onlyFields?: boolean;
};
export enum CatalogType {
    Table = 'table',
    Field = 'field',
    Group = 'group',
}
export type CatalogField = Pick<Field, 'name' | 'type' | 'description'> & {
    type: CatalogType.Field;
};

export type CatalogTable = Pick<Explore, 'name'> & {
    description?: string;
    type: CatalogType.Table;
};

export type CatalogItem = CatalogField | CatalogTable;
export type ApiCatalogResults = CatalogItem[];
