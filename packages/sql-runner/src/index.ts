import * as snowflake from "snowflake-sdk";
import * as bigquery from "@google-cloud/bigquery";
import * as postgres from "pg";

type Rows = any[] | undefined;

const runPostgresQuery = async (
  credentials: postgres.ConnectionConfig,
  query: string
): Promise<Rows> => {
  const client = new postgres.Client(credentials);
  await client.connect();
  const result = await client.query(query);
  return result.rows;
};

const runBigqueryQuery = async (
  credentials: bigquery.BigQueryOptions,
  query: string
): Promise<Rows> => {
  const client = new bigquery.BigQuery(credentials);
  const [job] = await client.createQueryJob({ query, useLegacySql: false });
  const [rows] = await job.getQueryResults(job);
  return rows;
};

const runSnowflakeQuery = async (
  credentials: snowflake.ConnectionOptions,
  query: string
): Promise<Rows> => {
  const connection = snowflake.createConnection(credentials);
  await new Promise<snowflake.Connection>((resolve, reject) => {
    connection.connect((err, conn) => {
      if (err) {
        reject(err);
      }
      resolve(conn);
    });
  });
  const rows = await new Promise<any[] | undefined>((resolve, reject) => {
    connection.execute({
      sqlText: query,
      complete: (err, stmt, rows) => {
        if (err) {
          reject(err);
        }
        resolve(rows);
      },
    });
  });
  await new Promise<void>((resolve, reject) => {
    connection.destroy((err, conn) => {
      if (err) {
        reject(err);
      }
      resolve();
    });
  });
  return rows;
};
