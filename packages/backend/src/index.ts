import express from "express";
import { BigQuery } from "@google-cloud/bigquery";

const app = express();
app.use(express.json())

app.post('/query', (req, res) => {
  const body: {query: string, projectId: string} = req.body;
  console.log(body);
  const bq = new BigQuery({ projectId: body.projectId});
  bq.createQueryJob({query: body.query})
     .then(([ job ]) => job.getQueryResults())
      .then(([ rows ]) => res.json(rows))
})

app.listen(process.env.PORT || 8080);
