import type {
    ApiAiAgentAdminConversationsResponse,
    ApiAiOrganizationSettingsResponse,
    ApiUpdateAiOrganizationSettingsResponse,
} from './adminTypes';
import type {
    ApiAiAgentReviewItemResponse,
    ApiAiAgentReviewItemsResponse,
    ApiAiAgentReviewSignalsResponse,
} from './aiAgentReviewClassifierTypes';
import type {
    ApiAiAgentDocumentContentResponse,
    ApiAiAgentDocumentResponse,
    ApiAiAgentDocumentSummaryListResponse,
} from './documentTypes';
import type {
    ApiAiAgentArtifactResponse,
    ApiAiAgentEvaluationResponse,
    ApiAiAgentEvaluationRunResponse,
    ApiAiAgentEvaluationRunResultsResponse,
    ApiAiAgentEvaluationRunSummaryListResponse,
    ApiAiAgentEvaluationSummaryListResponse,
    ApiAiAgentExploreAccessSummaryResponse,
    ApiAiAgentMcpServerToolListResponse,
    ApiAiAgentModelOptionsResponse,
    ApiAiAgentProjectThreadSummaryListResponse,
    ApiAiAgentResponse,
    ApiAiAgentSqlApprovalResponse,
    ApiAiAgentSummaryResponse,
    ApiAiAgentThreadCreateResponse,
    ApiAiAgentThreadGenerateTitleResponse,
    ApiAiAgentThreadMessageCreateResponse,
    ApiAiAgentThreadMessageVizQueryResponse,
    ApiAiAgentThreadMessageVizResponse,
    ApiAiAgentThreadResponse,
    ApiAiAgentThreadSummaryListResponse,
    ApiAiAgentVerifiedArtifactsResponse,
    ApiAiAgentVerifiedQuestionsResponse,
    ApiAiMcpServerListResponse,
    ApiAiMcpServerResponse,
    ApiAiMcpServerToolListResponse,
    ApiAppendInstructionResponse,
    ApiCloneThreadResponse,
    ApiCreateAiAgentResponse,
    ApiCreateEvaluationResponse,
    ApiGetUserAgentPreferencesResponse,
    ApiRevertChangeResponse,
    ApiStartAiMcpOAuthResponse,
    ApiUpdateEvaluationResponse,
    ApiUpdateUserAgentPreferencesResponse,
} from './index';
import type { ApiAgentReadinessScoreResponse } from './schemas/agentReadiness';
import type { ApiAgentSuggestionsResponse } from './schemas/agentSuggestions';

export type AiApiResults =
    | ApiAiAgentResponse['results']
    | ApiAiAgentSummaryResponse['results']
    | ApiCreateAiAgentResponse['results']
    | ApiAiMcpServerListResponse['results']
    | ApiAiMcpServerResponse['results']
    | ApiAiMcpServerToolListResponse['results']
    | ApiAiAgentMcpServerToolListResponse['results']
    | ApiStartAiMcpOAuthResponse['results']
    | ApiAiAgentThreadSummaryListResponse['results']
    | ApiAiAgentProjectThreadSummaryListResponse['results']
    | ApiAiAgentThreadResponse['results']
    | ApiAiAgentThreadCreateResponse['results']
    | ApiAiAgentSqlApprovalResponse['results']
    | ApiAiAgentThreadMessageCreateResponse['results']
    | ApiAiAgentThreadGenerateTitleResponse['results']
    | ApiAiAgentThreadMessageVizResponse['results']
    | ApiAiAgentThreadMessageVizQueryResponse['results']
    | ApiGetUserAgentPreferencesResponse['results']
    | ApiUpdateUserAgentPreferencesResponse['results']
    | ApiAiAgentExploreAccessSummaryResponse['results']
    | ApiAiAgentArtifactResponse['results']
    | ApiAiAgentVerifiedArtifactsResponse['results']
    | ApiAiAgentVerifiedQuestionsResponse['results']
    | ApiAiAgentEvaluationSummaryListResponse['results']
    | ApiAiAgentEvaluationResponse['results']
    | ApiAiAgentEvaluationRunResponse['results']
    | ApiAiAgentEvaluationRunSummaryListResponse['results']
    | ApiAiAgentEvaluationRunResultsResponse['results']
    | ApiCreateEvaluationResponse['results']
    | ApiUpdateEvaluationResponse['results']
    | ApiCloneThreadResponse['results']
    | ApiAppendInstructionResponse['results']
    | ApiRevertChangeResponse['results']
    | ApiAiAgentModelOptionsResponse['results']
    | ApiAiAgentAdminConversationsResponse['results']
    | ApiAiOrganizationSettingsResponse['results']
    | ApiUpdateAiOrganizationSettingsResponse['results']
    | ApiAiAgentDocumentResponse['results']
    | ApiAiAgentDocumentSummaryListResponse['results']
    | ApiAiAgentDocumentContentResponse['results']
    | ApiAiAgentReviewItemsResponse['results']
    | ApiAiAgentReviewItemResponse['results']
    | ApiAiAgentReviewSignalsResponse['results']
    | ApiAgentReadinessScoreResponse['results']
    | ApiAgentSuggestionsResponse['results'];
