import cube, {
    CubeApi,
    Query,
    QueryRecordType,
    QueryType,
    ResultSet,
} from '@cubejs-client/core';

type CubeArgs = {
    token: string;
    domain: string;
};

export default class CubeClient {
    // eslint-disable-next-line class-methods-use-this
    cubeApi: CubeApi;

    constructor({ token, domain }: CubeArgs) {
        this.cubeApi = cube(token, { apiUrl: `${domain}/cubejs-api/v1` });
    }

    async runQuery(cubeQuery: Query) {
        /* query sample: 
        {
        measures: ['Stories.count'],
        timeDimensions: [{
            dimension: 'Stories.time',
            dateRange: ['2015-01-01', '2015-12-31'],
            granularity: 'month'
        }]
        } */
        const resultSet = await this.cubeApi.load(cubeQuery);
        return resultSet;
    }

    async getSql(query: Query) {
        const sql = await this.cubeApi.sql(query);
        return sql;
    }
}
