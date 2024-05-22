import { type CompiledExploreJoin, type InlineError } from './explore';
import { type Dimension, type Field } from './field';
import { type TableBase } from './table';

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
> &
    Pick<Dimension, 'requiredAttributes'> & {
        type: CatalogType.Field;
    };

export type CatalogTable = Pick<
    TableBase,
    'name' | 'groupLabel' | 'description' | 'requiredAttributes'
> & {
    errors?: InlineError[]; // For explore errors
    type: CatalogType.Table;
    groupLabel?: string;
    joinedTables?: CompiledExploreJoin[]; // Matched type in explore
};

export type CatalogItem = CatalogField | CatalogTable;
export type ApiCatalogResults = CatalogItem[];
