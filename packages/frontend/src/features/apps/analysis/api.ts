import {
    type ApiDataAppAnalysisLookupResponse,
    type ApiDataAppAnalysisResponse,
    type ApiDataAppDetectResponse,
    type ApiDataAppInvestigateResponse,
    type DataAppAnalysisRecord,
    type DataAppAnalysisSource,
    type DataAppInvestigation,
} from '@lightdash/common';
import { lightdashApi } from '../../../api';
import { pollJobStatus } from '../../scheduler/hooks/useScheduler';

const analysisBase = (projectUuid: string, appUuid: string) =>
    `/projects/${projectUuid}/apps/${appUuid}/analysis`;

export const detectDataAppAnomalies = ({
    projectUuid,
    appUuid,
    sources,
    force,
}: {
    projectUuid: string;
    appUuid: string;
    sources: DataAppAnalysisSource[];
    /** Run the model even when an analysis of identical rows is stored. */
    force: boolean;
}) =>
    lightdashApi<ApiDataAppDetectResponse['results']>({
        version: 'v2',
        url: `${analysisBase(projectUuid, appUuid)}/detect`,
        method: 'POST',
        body: JSON.stringify({ sources, force }),
    });

/** A stored analysis of exactly these rows, or null. Never runs the model. */
export const lookupDataAppAnalysis = ({
    projectUuid,
    appUuid,
    sources,
}: {
    projectUuid: string;
    appUuid: string;
    sources: DataAppAnalysisSource[];
}) =>
    lightdashApi<ApiDataAppAnalysisLookupResponse['results']>({
        version: 'v2',
        url: `${analysisBase(projectUuid, appUuid)}/lookup`,
        method: 'POST',
        body: JSON.stringify({ sources }),
    });

const getDataAppAnalysis = ({
    projectUuid,
    appUuid,
    analysisId,
}: {
    projectUuid: string;
    appUuid: string;
    analysisId: string;
}) =>
    lightdashApi<ApiDataAppAnalysisResponse['results']>({
        version: 'v2',
        url: `${analysisBase(projectUuid, appUuid)}/${analysisId}`,
        method: 'GET',
        body: undefined,
    });

/**
 * Queues the investigation, waits for the job, then reads the persisted
 * result. The job's completion details carry the investigation id.
 */
export const investigateDataAppAnomaly = async ({
    projectUuid,
    appUuid,
    analysisId,
    anomalyId,
    agentUuid,
}: {
    projectUuid: string;
    appUuid: string;
    analysisId: string;
    anomalyId: string;
    agentUuid: string;
}): Promise<DataAppInvestigation> => {
    const { jobId } = await lightdashApi<
        ApiDataAppInvestigateResponse['results']
    >({
        version: 'v2',
        url: `${analysisBase(projectUuid, appUuid)}/${analysisId}/investigate`,
        method: 'POST',
        body: JSON.stringify({ anomalyId, agentUuid }),
    });
    const details = await pollJobStatus(jobId);
    const investigationId = details?.investigationId;
    if (typeof investigationId !== 'string') {
        throw new Error('The investigation finished without a result');
    }
    const record: DataAppAnalysisRecord = await getDataAppAnalysis({
        projectUuid,
        appUuid,
        analysisId: investigationId,
    });
    if (record.operation !== 'investigate') {
        throw new Error('Unexpected analysis type');
    }
    return record;
};
