import { getAthenaTimestampDomain } from './AthenaWarehouseClient';
import { getBigqueryTimestampDomain } from './BigqueryWarehouseClient';
import { getClickhouseTimestampDomain } from './ClickhouseWarehouseClient';
import { getDatabricksTimestampDomain } from './DatabricksWarehouseClient';
import { getDuckdbTimestampDomainFromString } from './DuckdbWarehouseClient';
import { getPostgresTimestampDomain } from './PostgresWarehouseClient';
import { getSnowflakeTimestampDomain } from './SnowflakeWarehouseClient';
import { getTrinoTimestampDomain } from './TrinoWarehouseClient';

describe('postgres timestamp domain', () => {
    it('classifies naive types', () => {
        expect(getPostgresTimestampDomain('timestamp')).toEqual('naive');
        expect(
            getPostgresTimestampDomain('timestamp without time zone'),
        ).toEqual('naive');
    });
    it('classifies aware types', () => {
        expect(getPostgresTimestampDomain('timestamptz')).toEqual('aware');
        expect(getPostgresTimestampDomain('timestamp with time zone')).toEqual(
            'aware',
        );
    });
    it('leaves non-timestamp types unclassified', () => {
        expect(getPostgresTimestampDomain('integer')).toBeUndefined();
        expect(getPostgresTimestampDomain('date')).toBeUndefined();
        expect(getPostgresTimestampDomain('time')).toBeUndefined();
    });
});

describe('bigquery timestamp domain', () => {
    it('classifies DATETIME as naive and TIMESTAMP as aware', () => {
        expect(getBigqueryTimestampDomain('DATETIME')).toEqual('naive');
        expect(getBigqueryTimestampDomain('TIMESTAMP')).toEqual('aware');
    });
    it('leaves TIME and non-timestamp types unclassified', () => {
        expect(getBigqueryTimestampDomain('TIME')).toBeUndefined();
        expect(getBigqueryTimestampDomain('STRING')).toBeUndefined();
    });
});

describe('snowflake timestamp domain', () => {
    it('classifies NTZ as naive, including parameterised types', () => {
        expect(getSnowflakeTimestampDomain('TIMESTAMP_NTZ')).toEqual('naive');
        expect(getSnowflakeTimestampDomain('TIMESTAMP_NTZ(9)')).toEqual(
            'naive',
        );
    });
    it('classifies TZ and LTZ as aware', () => {
        expect(getSnowflakeTimestampDomain('TIMESTAMP_TZ')).toEqual('aware');
        expect(getSnowflakeTimestampDomain('TIMESTAMP_LTZ(9)')).toEqual(
            'aware',
        );
    });
    it('leaves bare TIMESTAMP unclassified (account-level alias)', () => {
        expect(getSnowflakeTimestampDomain('TIMESTAMP')).toBeUndefined();
    });
});

describe('databricks timestamp domain', () => {
    it('classifies TIMESTAMP_NTZ as naive despite type normalization truncating it', () => {
        expect(getDatabricksTimestampDomain('TIMESTAMP_NTZ')).toEqual('naive');
    });
    it('classifies bare TIMESTAMP as aware (stores an instant)', () => {
        expect(getDatabricksTimestampDomain('TIMESTAMP')).toEqual('aware');
    });
    it('leaves non-timestamp types unclassified', () => {
        expect(getDatabricksTimestampDomain('DECIMAL(10,2)')).toBeUndefined();
    });
});

describe('trino timestamp domain', () => {
    it('classifies bare timestamp as naive, stripping any precision', () => {
        expect(getTrinoTimestampDomain('timestamp')).toEqual('naive');
        expect(getTrinoTimestampDomain('timestamp(3)')).toEqual('naive');
        expect(getTrinoTimestampDomain('timestamp(6)')).toEqual('naive');
    });
    it('classifies timestamp with time zone as aware', () => {
        expect(getTrinoTimestampDomain('timestamp with time zone')).toEqual(
            'aware',
        );
        expect(getTrinoTimestampDomain('timestamp(3) with time zone')).toEqual(
            'aware',
        );
    });
    it('leaves non-timestamp types unclassified', () => {
        expect(getTrinoTimestampDomain('varchar')).toBeUndefined();
    });
});

describe('clickhouse timestamp domain', () => {
    it('classifies DateTime types as always aware', () => {
        expect(getClickhouseTimestampDomain('DateTime')).toEqual('aware');
        expect(getClickhouseTimestampDomain("DateTime64(3, 'UTC')")).toEqual(
            'aware',
        );
        expect(getClickhouseTimestampDomain('Nullable(DateTime)')).toEqual(
            'aware',
        );
    });
    it('leaves non-timestamp types unclassified', () => {
        expect(getClickhouseTimestampDomain('Date')).toBeUndefined();
    });
});

describe('athena timestamp domain', () => {
    it('classifies bare timestamp as naive and with time zone as aware', () => {
        expect(getAthenaTimestampDomain('timestamp')).toEqual('naive');
        expect(getAthenaTimestampDomain('timestamp(3)')).toEqual('naive');
        expect(getAthenaTimestampDomain('timestamp with time zone')).toEqual(
            'aware',
        );
    });
    it('leaves non-timestamp types unclassified', () => {
        expect(getAthenaTimestampDomain('varchar')).toBeUndefined();
    });
});

describe('duckdb timestamp domain', () => {
    it('classifies type name strings', () => {
        expect(getDuckdbTimestampDomainFromString('TIMESTAMP')).toEqual(
            'naive',
        );
        expect(
            getDuckdbTimestampDomainFromString('TIMESTAMP WITH TIME ZONE'),
        ).toEqual('aware');
        expect(getDuckdbTimestampDomainFromString('TIMESTAMPTZ')).toEqual(
            'aware',
        );
        expect(getDuckdbTimestampDomainFromString('BOOLEAN')).toBeUndefined();
    });
});
