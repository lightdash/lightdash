import { Explore } from './explore';
import { ApiSqlQueryResults } from './sqlRunner';

export type CustomExplore = {
    sql: string;
    results: ApiSqlQueryResults;
    explore: Explore;
};
