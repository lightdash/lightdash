import { type Explore, type InlineError } from './explore';
import { type Field } from './field';

export enum CatalogType {
    Table = 'table',
    Field = 'field',
}

export type ApiCatalogSearch = {
    search?: string;
    type?: CatalogType;
};
export type CatalogField = Pick<
    Field,
    'name' | 'fieldType' | 'tableLabel' | 'description'
> & {
    type: CatalogType.Field;
};

export type CatalogTable = Pick<Explore, 'name' | 'groupLabel'> & {
    description?: string;
    errors?: InlineError[];
    type: CatalogType.Table;
    groupLabel?: string;
};

export type CatalogItem = CatalogField | CatalogTable;
export type ApiCatalogResults = CatalogItem[];
