import express from 'express';
import { dbtCloudIntegrationRouter } from './dbtCloudIntegrationRouter';

export const integrationsRouter = express.Router({ mergeParams: true });

integrationsRouter.use('/dbt-cloud', dbtCloudIntegrationRouter);
