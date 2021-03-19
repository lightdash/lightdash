import express from "express";
import { BigQuery } from "@google-cloud/bigquery";

const app = express();
app.use(express.json())

const log = (err: any, job: any, apiResponse: any) => {
    console.log(err)
    console.log(job)
    console.log(apiResponse)
}

const cb = (err: any, rows: any, apiResponse: any) => {
    console.log(err)
    console.log(rows)
    console.log(apiResponse)
}

app.post('/query', (req, res) => {
  const body: {query: string, projectId: string} = req.body;
  console.log(body);
  const bq = new BigQuery({ projectId: body.projectId});
  bq.createQueryJob({query: body.query})
     .then(([ job ]) => job.getQueryResults({}, cb))
})


app.listen(process.env.PORT || 8080);
