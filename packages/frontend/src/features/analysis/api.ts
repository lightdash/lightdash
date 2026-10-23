import {
    type AnalysisTargetLocator,
    type ApiDataAppAnalysisLookupResponse,
    type ApiDataAppAnalysisResponse,
    type ApiDataAppDetectResponse,
    type ApiDataAppInvestigateResponse,
    type DataAppAnalysisRecord,
    type DataAppAnalysisSource,
    type DataAppInvestigation,
} from '@lightdash/common';
import { type LightdashApi } from '../../api';
import { pollJobStatus } from '../scheduler/hooks/useScheduler';

const analysisBase = (projectUuid: string, target: AnalysisTargetLocator) =>
    target.kind === 'app'
        ? `/projects/${projectUuid}/apps/${target.appUuid}/analysis`
        : `/projects/${projectUuid}/dashboards/${target.dashboardUuid}/analysis`;

export const detectAnalysisAnomalies = (
    lightdashApi: LightdashApi,
    {
        projectUuid,
        target,
        sources,
        instructions,
        force,
    }: {
        projectUuid: string;
        target: AnalysisTargetLocator;
        sources: DataAppAnalysisSource[];
        /** Author guidance for the model; part of the analysis identity. */
        instructions: string | null;
        /** Run the model even when an analysis of identical rows is stored. */
        force: boolean;
    },
) =>
    lightdashApi<ApiDataAppDetectResponse['results']>({
        version: 'v2',
        url: `${analysisBase(projectUuid, target)}/detect`,
        method: 'POST',
        body: JSON.stringify({
            sources,
            force,
            ...(instructions !== null ? { instructions } : {}),
        }),
    });

/** A stored analysis of exactly these rows, or null. Never runs the model. */
export const lookupAnalysis = (
    lightdashApi: LightdashApi,
    {
        projectUuid,
        target,
        sources,
        instructions,
    }: {
        projectUuid: string;
        target: AnalysisTargetLocator;
        sources: DataAppAnalysisSource[];
        instructions: string | null;
    },
) =>
    lightdashApi<ApiDataAppAnalysisLookupResponse['results']>({
        version: 'v2',
        url: `${analysisBase(projectUuid, target)}/lookup`,
        method: 'POST',
        body: JSON.stringify({
            sources,
            ...(instructions !== null ? { instructions } : {}),
        }),
    });

const getAnalysis = (
    lightdashApi: LightdashApi,
    {
        projectUuid,
        target,
        analysisId,
    }: {
        projectUuid: string;
        target: AnalysisTargetLocator;
        analysisId: string;
    },
) =>
    lightdashApi<ApiDataAppAnalysisResponse['results']>({
        version: 'v2',
        url: `${analysisBase(projectUuid, target)}/${analysisId}`,
        method: 'GET',
        body: undefined,
    });

/**
 * Queues the investigation, waits for the job, then reads the persisted
 * result. The job's completion details carry the investigation id.
 */
export const investigateAnalysisAnomaly = async (
    lightdashApi: LightdashApi,
    {
        projectUuid,
        target,
        analysisId,
        anomalyId,
        agentUuid,
    }: {
        projectUuid: string;
        target: AnalysisTargetLocator;
        analysisId: string;
        anomalyId: string;
        agentUuid: string;
    },
): Promise<DataAppInvestigation> => {
    const { jobId } = await lightdashApi<
        ApiDataAppInvestigateResponse['results']
    >({
        version: 'v2',
        url: `${analysisBase(projectUuid, target)}/${analysisId}/investigate`,
        method: 'POST',
        body: JSON.stringify({ anomalyId, agentUuid }),
    });
    const details = await pollJobStatus(lightdashApi, jobId);
    const investigationId = details?.investigationId;
    if (typeof investigationId !== 'string') {
        throw new Error('The investigation finished without a result');
    }
    const record: DataAppAnalysisRecord = await getAnalysis(lightdashApi, {
        projectUuid,
        target,
        analysisId: investigationId,
    });
    if (record.operation !== 'investigate') {
        throw new Error('Unexpected analysis type');
    }
    return record;
};
