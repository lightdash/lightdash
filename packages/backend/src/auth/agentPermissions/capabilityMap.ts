import { AgentCapability, type AgentToolName } from '@lightdash/common';

export type RequiredAgentCapabilities = readonly [
    AgentCapability,
    ...AgentCapability[],
];

export const MCP_TOOL_CAPABILITIES = {
    clear_agent: [AgentCapability.ReadDiscover],
    connect_agent: [AgentCapability.ReadDiscover],
    create_content: [AgentCapability.ContentWrite],
    create_scheduled_delivery: [
        AgentCapability.ContentWrite,
        AgentCapability.Publish,
    ],
    edit_content: [AgentCapability.ContentWrite],
    find_content: [AgentCapability.ReadDiscover],
    generate_data_app: [AgentCapability.ContentWrite],
    generate_hashes: [AgentCapability.ReadDiscover],
    get_ai_writeback_status: [AgentCapability.ReadDiscover],
    get_context: [AgentCapability.ReadDiscover],
    get_current_agent: [AgentCapability.ReadDiscover],
    get_current_project: [AgentCapability.ReadDiscover],
    get_data_app_build_status: [AgentCapability.ReadDiscover],
    get_lightdash_version: [AgentCapability.ReadDiscover],
    get_metadata: [AgentCapability.ReadDiscover],
    get_query_result: [AgentCapability.ReadDiscover],
    grep_fields: [AgentCapability.ReadDiscover],
    iterate_data_app: [AgentCapability.ContentWrite],
    list_agents: [AgentCapability.ReadDiscover],
    list_content: [AgentCapability.ReadDiscover],
    list_data_app_themes: [AgentCapability.ReadDiscover],
    list_explores: [AgentCapability.ReadDiscover],
    list_projects: [AgentCapability.ReadDiscover],
    list_skills: [AgentCapability.ReadDiscover],
    list_verified_content: [AgentCapability.ReadDiscover],
    read_content: [AgentCapability.ReadDiscover],
    read_skill: [AgentCapability.ReadDiscover],
    read_skill_resource: [AgentCapability.ReadDiscover],
    render_chart: [AgentCapability.Export],
    resolve_url: [AgentCapability.ReadDiscover],
    route_agent: [AgentCapability.ReadDiscover],
    run_ai_writeback: [AgentCapability.DbtWriteback],
    run_composer_queries: [AgentCapability.Query],
    run_metric_query: [AgentCapability.Query],
    run_sql: [AgentCapability.RawSql],
    search_field_values: [AgentCapability.Query],
    set_agent: [AgentCapability.ReadDiscover],
    set_project: [AgentCapability.ReadDiscover],
} as const satisfies Record<string, RequiredAgentCapabilities>;

export const AGENT_TOOL_CAPABILITIES = {
    analyzeFieldImpact: [AgentCapability.ReadDiscover],
    closePullRequest: [AgentCapability.DbtWriteback],
    createContent: [AgentCapability.ContentWrite],
    createScheduledDelivery: [
        AgentCapability.ContentWrite,
        AgentCapability.Publish,
    ],
    delegateResearchTask: [AgentCapability.Query],
    describeWarehouseTable: [AgentCapability.RawSql],
    discoverFields: [AgentCapability.ReadDiscover],
    discoverRepos: [AgentCapability.ReadDiscover],
    editContent: [AgentCapability.ContentWrite],
    editDbtProject: [AgentCapability.DbtWriteback],
    editProjectContext: [AgentCapability.DbtWriteback],
    editRepo: [AgentCapability.DbtWriteback],
    exploreRepo: [AgentCapability.ReadDiscover],
    exportChartAsCode: [AgentCapability.Export],
    findCharts: [AgentCapability.ReadDiscover],
    findContent: [AgentCapability.ReadDiscover],
    findCustomChartTypes: [AgentCapability.ReadDiscover],
    findDashboards: [AgentCapability.ReadDiscover],
    findExplores: [AgentCapability.ReadDiscover],
    findFields: [AgentCapability.ReadDiscover],
    generateDashboard: [AgentCapability.ContentWrite],
    generateDataApp: [AgentCapability.ContentWrite],
    generateHashes: [AgentCapability.ReadDiscover],
    generateUuids: [AgentCapability.ReadDiscover],
    generateVisualization: [AgentCapability.Query],
    getDashboardCharts: [AgentCapability.ReadDiscover],
    getKnowledgeDocumentContent: [AgentCapability.ReadDiscover],
    getMetadata: [AgentCapability.ReadDiscover],
    getProjectInfo: [AgentCapability.ReadDiscover],
    getPullRequestDiff: [AgentCapability.ReadDiscover],
    grepFields: [AgentCapability.ReadDiscover],
    iterateDataApp: [AgentCapability.ContentWrite],
    listContent: [AgentCapability.ReadDiscover],
    listDataAppThemes: [AgentCapability.ReadDiscover],
    listKnowledgeDocuments: [AgentCapability.ReadDiscover],
    listProjects: [AgentCapability.ReadDiscover],
    listWarehouseTables: [AgentCapability.RawSql],
    listWorkstreams: [AgentCapability.ReadDiscover],
    loadAgentTools: [AgentCapability.ReadDiscover],
    loadMcpTools: [AgentCapability.ReadDiscover],
    loadProjectContext: [AgentCapability.ReadDiscover],
    loadSkill: [AgentCapability.ReadDiscover],
    readAttachments: [AgentCapability.ReadDiscover],
    readContent: [AgentCapability.ReadDiscover],
    readPinnedThread: [AgentCapability.ReadDiscover],
    resolveUrl: [AgentCapability.ReadDiscover],
    runComposerQueries: [AgentCapability.Query],
    runContentQuery: [AgentCapability.Query],
    runQuery: [AgentCapability.Query],
    runSavedChart: [AgentCapability.Query],
    runSql: [AgentCapability.RawSql],
    searchFieldValues: [AgentCapability.Query],
    searchSemanticLayer: [AgentCapability.ReadDiscover],
    setupPreviewDeploy: [
        AgentCapability.DeployUpload,
        AgentCapability.DbtWriteback,
    ],
    submitResearchReport: [AgentCapability.ContentWrite],
    submitWorkerFindings: [AgentCapability.ReadDiscover],
    syncDbtProject: [AgentCapability.DeployUpload],
    updateUserName: [AgentCapability.Administration],
} as const satisfies Record<
    AgentToolName | 'exportChartAsCode' | 'loadAgentTools',
    RequiredAgentCapabilities
>;

export const REST_OPERATION_CAPABILITIES = {
    'AgentPermissionController.getPolicy': [AgentCapability.Administration],
    'AgentPermissionController.saveCeiling': [AgentCapability.Administration],
    'AgentPermissionController.applyPilotPreset': [
        AgentCapability.Administration,
    ],
    'AgentPermissionController.resetToLegacy': [AgentCapability.Administration],
    'AgentPermissionController.getWarehouseConfirmation': [
        AgentCapability.Administration,
    ],
    'AgentPermissionController.confirmWarehouse': [
        AgentCapability.Administration,
    ],
    'AgentPermissionController.deleteWarehouseConfirmation': [
        AgentCapability.Administration,
    ],

    'AiAccessController.getCapabilities': [AgentCapability.ReadDiscover],
    'AiAccessController.getMyAccess': [AgentCapability.ReadDiscover],
    'AiAccessController.testMarker': [AgentCapability.Administration],
    'AiAgentAdminController.addReviewItemComment': [
        AgentCapability.Administration,
    ],
    'AiAgentAdminController.backfillReviewJiraIssues': [
        AgentCapability.Administration,
    ],
    'AiAgentAdminController.backfillReviewLinearIssues': [
        AgentCapability.Administration,
    ],
    'AiAgentAdminController.captureReviewReplayInputs': [
        AgentCapability.Administration,
    ],
    'AiAgentAdminController.createReviewItem': [AgentCapability.Administration],
    'AiAgentAdminController.createReviewItemWriteback': [
        AgentCapability.DbtWriteback,
    ],
    'AiAgentAdminController.deleteThread': [AgentCapability.Delete],
    'AiAgentAdminController.getAdminEvalPrompts': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentAdminController.getAllAgents': [AgentCapability.ReadDiscover],
    'AiAgentAdminController.getAllAiAgentMemories': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentAdminController.getAllEvals': [AgentCapability.ReadDiscover],
    'AiAgentAdminController.getAllThreads': [AgentCapability.ReadDiscover],
    'AiAgentAdminController.getEmbedToken': [
        AgentCapability.Publish,
        AgentCapability.Administration,
    ],
    'AiAgentAdminController.getMcpActivity': [AgentCapability.ReadDiscover],
    'AiAgentAdminController.getMcpActivityStats': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentAdminController.getProjectPromptActivity': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentAdminController.getReviewItem': [AgentCapability.ReadDiscover],
    'AiAgentAdminController.getReviewItemActivity': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentAdminController.getReviewItemByPreviewThread': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentAdminController.getReviewItemPrDiff': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentAdminController.getReviewItemWritebackPreview': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentAdminController.getReviewItems': [AgentCapability.ReadDiscover],
    'AiAgentAdminController.getReviewJiraDestination': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentAdminController.getReviewJiraRouting': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentAdminController.getReviewLinearDestination': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentAdminController.getReviewLinearRouting': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentAdminController.getReviewNotificationSettings': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentAdminController.getReviewSignals': [AgentCapability.ReadDiscover],
    'AiAgentAdminController.getSettings': [AgentCapability.ReadDiscover],
    'AiAgentAdminController.getThreadDump': [AgentCapability.ReadDiscover],
    'AiAgentAdminController.getThreadRetentionPreview': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentAdminController.reorderReviewItems': [
        AgentCapability.Administration,
    ],
    'AiAgentAdminController.retestReviewRemediation': [AgentCapability.Query],
    'AiAgentAdminController.updateReviewItemAssignee': [
        AgentCapability.Administration,
    ],
    'AiAgentAdminController.updateReviewItemPriority': [
        AgentCapability.Administration,
    ],
    'AiAgentAdminController.updateReviewItemStatus': [
        AgentCapability.Administration,
    ],
    'AiAgentAdminController.updateReviewJiraDestination': [
        AgentCapability.Administration,
    ],
    'AiAgentAdminController.updateReviewJiraRouting': [
        AgentCapability.Administration,
    ],
    'AiAgentAdminController.updateReviewLinearDestination': [
        AgentCapability.Administration,
    ],
    'AiAgentAdminController.updateReviewLinearRouting': [
        AgentCapability.Administration,
    ],
    'AiAgentAdminController.updateReviewNotificationSettings': [
        AgentCapability.Administration,
    ],
    'AiAgentAdminController.upsertSettings': [AgentCapability.Administration],
    'AiAgentController.appendInstruction': [AgentCapability.Administration],
    'AiAgentController.appendToEvaluation': [AgentCapability.Administration],
    'AiAgentController.cloneAgentThread': [AgentCapability.ReadDiscover],
    'AiAgentController.cloneAiAgentThreadShare': [AgentCapability.ReadDiscover],
    'AiAgentController.connectGithubMcpServer': [
        AgentCapability.Administration,
    ],
    'AiAgentController.connectGithubMcpServerApp': [
        AgentCapability.Administration,
    ],
    'AiAgentController.createAgent': [AgentCapability.Administration],
    'AiAgentController.createAgentThread': [AgentCapability.ReadDiscover],
    'AiAgentController.createAgentThreadMessage': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentController.createAgentThreadMessageSteer': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentController.createAiAgentThreadShare': [AgentCapability.Publish],
    'AiAgentController.createEvaluation': [AgentCapability.Administration],
    'AiAgentController.createMcpServer': [AgentCapability.Administration],
    'AiAgentController.decideAgentSqlApproval': [
        AgentCapability.Administration,
    ],
    'AiAgentController.deleteAgent': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'AiAgentController.deleteAgentThread': [AgentCapability.Delete],
    'AiAgentController.deleteEvaluation': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'AiAgentController.deleteMcpServer': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'AiAgentController.deleteUserAgentPreferences': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentController.disconnectMcpOAuthConnection': [
        AgentCapability.Administration,
    ],
    'AiAgentController.evaluateAgentReadiness': [AgentCapability.Query],
    'AiAgentController.generateAgentThreadResponse': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentController.generateAgentThreadTitle': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentController.getAgent': [AgentCapability.ReadDiscover],
    'AiAgentController.getAgentExploreAccessSummary': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentController.getAgentSuggestions': [AgentCapability.ReadDiscover],
    'AiAgentController.getAgentThread': [AgentCapability.ReadDiscover],
    'AiAgentController.getAgentThreadLiveStatuses': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentController.getAgentThreadPullRequest': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentController.getAiAgentMemory': [AgentCapability.ReadDiscover],
    'AiAgentController.getArtifact': [AgentCapability.ReadDiscover],
    'AiAgentController.getArtifactVersion': [AgentCapability.ReadDiscover],
    'AiAgentController.getArtifactVizQuery': [AgentCapability.Query],
    'AiAgentController.getDashboardArtifactChartVizQuery': [
        AgentCapability.Query,
    ],
    'AiAgentController.getEvaluation': [AgentCapability.ReadDiscover],
    'AiAgentController.getEvaluationRunResults': [AgentCapability.ReadDiscover],
    'AiAgentController.getEvaluationRuns': [AgentCapability.ReadDiscover],
    'AiAgentController.getEvaluations': [AgentCapability.ReadDiscover],
    'AiAgentController.getGithubMcpAvailability': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentController.getModelOptions': [AgentCapability.ReadDiscover],
    'AiAgentController.getUserAgentPreferences': [AgentCapability.ReadDiscover],
    'AiAgentController.getVerifiedArtifacts': [AgentCapability.ReadDiscover],
    'AiAgentController.getVerifiedQuestions': [AgentCapability.ReadDiscover],
    'AiAgentController.interruptAgentThreadMessage': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentController.listAgentMcpServerTools': [AgentCapability.ReadDiscover],
    'AiAgentController.listAgentMcpServers': [AgentCapability.ReadDiscover],
    'AiAgentController.listAgentThreadWorkstreams': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentController.listAgentThreads': [AgentCapability.ReadDiscover],
    'AiAgentController.listAgents': [AgentCapability.ReadDiscover],
    'AiAgentController.listMcpServerTools': [AgentCapability.ReadDiscover],
    'AiAgentController.listMcpServers': [AgentCapability.ReadDiscover],
    'AiAgentController.listProjectThreads': [AgentCapability.ReadDiscover],
    'AiAgentController.pinAgentThread': [AgentCapability.ContentWrite],
    'AiAgentController.refreshMcpServerTools': [AgentCapability.Administration],
    'AiAgentController.renameMcpServer': [AgentCapability.Administration],
    'AiAgentController.restoreAgentThreadDataAppVersion': [
        AgentCapability.ContentWrite,
    ],
    'AiAgentController.runEvaluation': [AgentCapability.Query],
    'AiAgentController.setArtifactVersionVerified': [AgentCapability.Publish],
    'AiAgentController.setUserDefaultAgent': [AgentCapability.ReadDiscover],
    'AiAgentController.startMcpOAuthConnection': [
        AgentCapability.Administration,
    ],
    'AiAgentController.streamAgentThreadResponse': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentController.unpinAgentThread': [AgentCapability.ContentWrite],
    'AiAgentController.updateAgent': [AgentCapability.Administration],
    'AiAgentController.updateAgentMcpServerTools': [
        AgentCapability.Administration,
    ],
    'AiAgentController.updateAgentThread': [AgentCapability.ReadDiscover],
    'AiAgentController.updateAgentThreadMessageSavedQuery': [
        AgentCapability.ContentWrite,
    ],
    'AiAgentController.updateArtifactVersionSavedDashboard': [
        AgentCapability.ContentWrite,
    ],
    'AiAgentController.updateArtifactVersionSavedSql': [
        AgentCapability.ContentWrite,
    ],
    'AiAgentController.updateArtifactVersionVizConfig': [
        AgentCapability.ContentWrite,
    ],
    'AiAgentController.updateEvaluation': [AgentCapability.Administration],
    'AiAgentController.updateMcpServerBearerCredential': [
        AgentCapability.Administration,
    ],
    'AiAgentController.updatePromptFeedback': [AgentCapability.ReadDiscover],
    'AiAgentController.uploadAgentAvatar': [AgentCapability.Administration],
    'AiAgentDocumentController.createDocument': [
        AgentCapability.Administration,
    ],
    'AiAgentDocumentController.deleteDocument': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'AiAgentDocumentController.listDocuments': [AgentCapability.ReadDiscover],
    'AiAgentLiveActivityController.registerLiveActivity': [
        AgentCapability.Administration,
    ],
    'AiAgentLiveActivityController.revokeLiveActivity': [
        AgentCapability.Administration,
    ],
    'AiAgentMemoryController.getAiAgentMemoryBySlug': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentMemoryController.getMyAiAgentMemories': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentMemoryController.promoteAiAgentMemory': [AgentCapability.Publish],
    'AiAgentMemoryController.triggerAiAgentMemoryDistill': [
        AgentCapability.Administration,
    ],
    'AiAgentMemoryController.updateAiAgentMemoryStatus': [
        AgentCapability.ContentWrite,
    ],
    'AiAgentScopedDocumentController.createDocument': [
        AgentCapability.Administration,
    ],
    'AiAgentScopedDocumentController.deleteDocument': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'AiAgentScopedDocumentController.getDocumentContent': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentScopedDocumentController.listDocuments': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentScopedDocumentController.updateDocument': [
        AgentCapability.Administration,
    ],
    'AiAgentScopedDocumentController.updateDocumentContent': [
        AgentCapability.Administration,
    ],
    'AiAgentScopedSkillController.listAgentSkills': [
        AgentCapability.ReadDiscover,
    ],
    'AiAgentScopedSkillController.setAgentSkills': [
        AgentCapability.Administration,
    ],
    'AiAgentSkillController.createSkill': [AgentCapability.Administration],
    'AiAgentSkillController.deleteSkill': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'AiAgentSkillController.getSkill': [AgentCapability.ReadDiscover],
    'AiAgentSkillController.getSkillsAsCode': [AgentCapability.ReadDiscover],
    'AiAgentSkillController.getVersion': [AgentCapability.ReadDiscover],
    'AiAgentSkillController.listSkills': [AgentCapability.ReadDiscover],
    'AiAgentSkillController.listVersions': [AgentCapability.ReadDiscover],
    'AiAgentSkillController.restoreVersion': [AgentCapability.Administration],
    'AiAgentSkillController.updateSkill': [AgentCapability.Administration],
    'AiAgentSkillController.upsertSkillsAsCode': [
        AgentCapability.Administration,
    ],
    'AiAgentSkillController.validateSkill': [AgentCapability.ReadDiscover],
    'AiController.generateChartMetadata': [AgentCapability.Query],
    'AiController.generateCustomDimension': [AgentCapability.Query],
    'AiController.generateCustomViz': [AgentCapability.Query],
    'AiController.generateFormulaTableCalculation': [AgentCapability.Query],
    'AiController.generateGoogleSheetsExtensionReportDraft': [
        AgentCapability.Administration,
    ],
    'AiController.generateTableCalculation': [AgentCapability.Query],
    'AiController.generateTooltip': [AgentCapability.Query],
    'AiController.suggestChartTypeExplore': [AgentCapability.Query],
    'AiController.suggestChartTypeFields': [AgentCapability.Query],
    'AiCreditController.getDailyUsage': [AgentCapability.ReadDiscover],
    'AiCreditController.getUsage': [AgentCapability.ReadDiscover],
    'AiDeepResearchController.cancelRun': [AgentCapability.Administration],
    'AiDeepResearchController.createRun': [AgentCapability.Query],
    'AiDeepResearchController.getChart': [AgentCapability.ReadDiscover],
    'AiDeepResearchController.getRun': [AgentCapability.ReadDiscover],
    'AiDeepResearchController.listEvents': [AgentCapability.ReadDiscover],
    'AiDeepResearchController.listRuns': [AgentCapability.ReadDiscover],
    'AiDeepResearchController.refreshChart': [AgentCapability.Query],
    'AiOrganizationSettingsController.getRuntimeSettings': [
        AgentCapability.ReadDiscover,
    ],
    'AiProviderCredentialController.adoptLegacyCredential': [
        AgentCapability.Administration,
    ],
    'AiProviderCredentialController.createCredential': [
        AgentCapability.Administration,
    ],
    'AiProviderCredentialController.deleteCredential': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'AiProviderCredentialController.getProjectCredential': [
        AgentCapability.ReadDiscover,
    ],
    'AiProviderCredentialController.listCredentials': [
        AgentCapability.ReadDiscover,
    ],
    'AiProviderCredentialController.replaceCredential': [
        AgentCapability.Administration,
    ],
    'AiProviderCredentialController.setDefaultCredential': [
        AgentCapability.Administration,
    ],
    'AiProviderCredentialController.setProjectCredential': [
        AgentCapability.Administration,
    ],
    'AiProviderCredentialController.updateCredential': [
        AgentCapability.Administration,
    ],
    'AiRouterController.commit': [AgentCapability.ReadDiscover],
    'AiRouterController.getConfig': [AgentCapability.ReadDiscover],
    'AiRouterController.getInstruction': [AgentCapability.ReadDiscover],
    'AiRouterController.listDecisions': [AgentCapability.ReadDiscover],
    'AiRouterController.route': [AgentCapability.ReadDiscover],
    'AiRouterController.upsertConfig': [AgentCapability.Administration],
    'AiRouterController.upsertInstruction': [AgentCapability.Administration],
    'AiServiceAccountController.delete': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'AiServiceAccountController.get': [AgentCapability.ReadDiscover],
    'AiServiceAccountController.test': [AgentCapability.Administration],
    'AiServiceAccountController.upsert': [AgentCapability.Administration],
    'AiThreadFileController.delete': [AgentCapability.Delete],
    'AiThreadFileController.upload': [AgentCapability.DeployUpload],
    'AiWritebackController.closeWritebackPullRequest': [
        AgentCapability.DbtWriteback,
    ],
    'AiWritebackController.getAiWritebackRunStatus': [
        AgentCapability.ReadDiscover,
    ],
    'AiWritebackController.getProjectCiStatus': [AgentCapability.ReadDiscover],
    'AiWritebackController.getPullRequestCiChecks': [
        AgentCapability.ReadDiscover,
    ],
    'AiWritebackController.getPullRequestDiff': [AgentCapability.ReadDiscover],
    'AiWritebackController.listProjectFiles': [AgentCapability.ReadDiscover],
    'AiWritebackController.listProjectRepositories': [
        AgentCapability.ReadDiscover,
    ],
    'AiWritebackController.mergeWritebackPullRequest': [
        AgentCapability.DbtWriteback,
    ],
    'AiWritebackController.runAiWriteback': [AgentCapability.DbtWriteback],
    'AppGenerateController.cancelAppVersion': [AgentCapability.ContentWrite],
    'AppGenerateController.clarifyApp': [AgentCapability.ContentWrite],
    'AppGenerateController.clearAppAgentContext': [
        AgentCapability.ContentWrite,
    ],
    'AppGenerateController.createAppScheduler': [
        AgentCapability.ContentWrite,
        AgentCapability.Publish,
    ],
    'AppGenerateController.deleteApp': [AgentCapability.Delete],
    'AppGenerateController.deleteAppThumbnail': [AgentCapability.Delete],
    'AppGenerateController.duplicateApp': [AgentCapability.ContentWrite],
    'AppGenerateController.generateApp': [AgentCapability.ContentWrite],
    'AppGenerateController.getApp': [AgentCapability.ReadDiscover],
    'AppGenerateController.getAppCode': [AgentCapability.ReadDiscover],
    'AppGenerateController.getAppImageUrl': [AgentCapability.ReadDiscover],
    'AppGenerateController.getAppPromoteDiff': [AgentCapability.ReadDiscover],
    'AppGenerateController.getAppSchedulers': [AgentCapability.ReadDiscover],
    'AppGenerateController.getAppThumbnailUrl': [AgentCapability.ReadDiscover],
    'AppGenerateController.getAppVersionThumbnailUrl': [
        AgentCapability.ReadDiscover,
    ],
    'AppGenerateController.getChartDataAppVizPreviewToken': [
        AgentCapability.ReadDiscover,
    ],
    'AppGenerateController.getChartDataAppVizRenderMetadata': [
        AgentCapability.ReadDiscover,
    ],
    'AppGenerateController.getDataAppAuthoringContext': [
        AgentCapability.ReadDiscover,
    ],
    'AppGenerateController.getDataAppVisualization': [
        AgentCapability.ReadDiscover,
    ],
    'AppGenerateController.getDataAppVizDeleteImpact': [
        AgentCapability.ReadDiscover,
    ],
    'AppGenerateController.getDataAppVizPreviewToken': [
        AgentCapability.ReadDiscover,
    ],
    'AppGenerateController.getDataAppVizRenderMetadata': [
        AgentCapability.ReadDiscover,
    ],
    'AppGenerateController.getDataAppVizUpgradeImpact': [
        AgentCapability.ReadDiscover,
    ],
    'AppGenerateController.getDocumentDataAppVizPreviewToken': [
        AgentCapability.ReadDiscover,
    ],
    'AppGenerateController.getDocumentDataAppVizRenderMetadata': [
        AgentCapability.ReadDiscover,
    ],
    'AppGenerateController.getPreviewToken': [AgentCapability.ReadDiscover],
    'AppGenerateController.importAppCode': [AgentCapability.DeployUpload],
    'AppGenerateController.installRegistryChartType': [
        AgentCapability.ContentWrite,
    ],
    'AppGenerateController.iterateApp': [AgentCapability.ContentWrite],
    'AppGenerateController.listDataAppVisualizations': [
        AgentCapability.ReadDiscover,
    ],
    'AppGenerateController.listProjectApps': [AgentCapability.ReadDiscover],
    'AppGenerateController.listProjectChartTypes': [
        AgentCapability.ReadDiscover,
    ],
    'AppGenerateController.listRegistryChartTypes': [
        AgentCapability.ReadDiscover,
    ],
    'AppGenerateController.promoteApp': [AgentCapability.Publish],
    'AppGenerateController.restoreAppVersion': [AgentCapability.ContentWrite],
    'AppGenerateController.toggleAppPinning': [AgentCapability.ContentWrite],
    'AppGenerateController.unverifyDataApp': [AgentCapability.Publish],
    'AppGenerateController.updateApp': [AgentCapability.ContentWrite],
    'AppGenerateController.upgradeApp': [AgentCapability.ContentWrite],
    'AppGenerateController.uploadFile': [AgentCapability.DeployUpload],
    'AppGenerateController.uploadImage': [AgentCapability.DeployUpload],
    'AppGenerateController.uploadThumbnail': [AgentCapability.DeployUpload],
    'AppGenerateController.verifyDataApp': [AgentCapability.Publish],
    'BigquerySSOController.get': [AgentCapability.ReadDiscover],
    'BigquerySSOController.getBigQueryDatabases': [
        AgentCapability.ReadDiscover,
    ],
    'BigquerySSOController.getBigQueryProjectRecommendation': [
        AgentCapability.ReadDiscover,
    ],
    'BigquerySSOController.getBigQueryProjects': [AgentCapability.ReadDiscover],
    'CatalogController.acquireMetricsTreeLock': [AgentCapability.ContentWrite],
    'CatalogController.addCategoryToCatalogItem': [
        AgentCapability.ContentWrite,
    ],
    'CatalogController.createMetricsTree': [AgentCapability.ContentWrite],
    'CatalogController.createMetricsTreeEdge': [AgentCapability.ContentWrite],
    'CatalogController.deleteMetricsTree': [AgentCapability.Delete],
    'CatalogController.deleteMetricsTreeEdge': [AgentCapability.Delete],
    'CatalogController.getAllMetricsTreeEdges': [AgentCapability.ReadDiscover],
    'CatalogController.getAnalytics': [AgentCapability.ReadDiscover],
    'CatalogController.getAnalyticsField': [AgentCapability.ReadDiscover],
    'CatalogController.getCatalog': [AgentCapability.ReadDiscover],
    'CatalogController.getFilterDimensions': [AgentCapability.ReadDiscover],
    'CatalogController.getMetadata': [AgentCapability.ReadDiscover],
    'CatalogController.getMetric': [AgentCapability.ReadDiscover],
    'CatalogController.getMetricOwners': [AgentCapability.ReadDiscover],
    'CatalogController.getMetricsCatalog': [AgentCapability.ReadDiscover],
    'CatalogController.getMetricsTree': [AgentCapability.ReadDiscover],
    'CatalogController.getMetricsTreeDetails': [AgentCapability.ReadDiscover],
    'CatalogController.getMetricsTreeLegacy': [AgentCapability.ReadDiscover],
    'CatalogController.getMetricsTrees': [AgentCapability.ReadDiscover],
    'CatalogController.getMetricsWithTimeDimensions': [
        AgentCapability.ReadDiscover,
    ],
    'CatalogController.getSegmentDimensions': [AgentCapability.ReadDiscover],
    'CatalogController.hasMetricsInCatalog': [AgentCapability.ReadDiscover],
    'CatalogController.refreshMetricsTreeLockHeartbeat': [
        AgentCapability.ContentWrite,
    ],
    'CatalogController.releaseMetricsTreeLock': [AgentCapability.ContentWrite],
    'CatalogController.removeCategoryFromCatalogItem': [
        AgentCapability.ContentWrite,
    ],
    'CatalogController.updateCatalogItemIcon': [AgentCapability.ContentWrite],
    'CatalogController.updateMetricsTree': [AgentCapability.ContentWrite],
    'CatalogV2Controller.getPaginatedMetricsWithTimeDimensions': [
        AgentCapability.ReadDiscover,
    ],
    'CommentsController.createComment': [AgentCapability.ContentWrite],
    'CommentsController.deleteComment': [AgentCapability.Delete],
    'CommentsController.getComments': [AgentCapability.ReadDiscover],
    'CommentsController.resolveComment': [AgentCapability.ContentWrite],
    'ContentController.bulkDeleteContent': [AgentCapability.Delete],
    'ContentController.bulkMoveContent': [AgentCapability.Publish],
    'ContentController.deleteContent': [AgentCapability.Delete],
    'ContentController.listContent': [AgentCapability.ReadDiscover],
    'ContentController.listDeletedContent': [AgentCapability.ReadDiscover],
    'ContentController.moveContent': [AgentCapability.Publish],
    'ContentController.permanentlyDeleteContent': [AgentCapability.Delete],
    'ContentController.restoreContent': [AgentCapability.ContentWrite],
    'ContentReviewRequestController.approve': [AgentCapability.Publish],
    'ContentReviewRequestController.cancel': [AgentCapability.ContentWrite],
    'ContentReviewRequestController.compareSimilar': [
        AgentCapability.ReadDiscover,
    ],
    'ContentReviewRequestController.findSimilar': [
        AgentCapability.ReadDiscover,
    ],
    'ContentReviewRequestController.get': [AgentCapability.ReadDiscover],
    'ContentReviewRequestController.getPendingForContent': [
        AgentCapability.ReadDiscover,
    ],
    'ContentReviewRequestController.getSettings': [
        AgentCapability.ReadDiscover,
    ],
    'ContentReviewRequestController.list': [AgentCapability.ReadDiscover],
    'ContentReviewRequestController.reject': [AgentCapability.ContentWrite],
    'ContentReviewRequestController.submit': [AgentCapability.ContentWrite],
    'ContentReviewRequestController.updateSettings': [
        AgentCapability.Administration,
    ],
    'CsvController.get': [AgentCapability.Export],
    'CustomRolesController.addScopesToRole': [AgentCapability.Administration],
    'CustomRolesController.createOrganizationRole': [
        AgentCapability.Administration,
    ],
    'CustomRolesController.deleteOrganizationRole': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'CustomRolesController.getOrganizationRoleAssignees': [
        AgentCapability.ReadDiscover,
    ],
    'CustomRolesController.removeScopeFromRole': [
        AgentCapability.Administration,
    ],
    'CustomRolesController.updateOrganizationRole': [
        AgentCapability.Administration,
    ],
    'DashboardController.createDashboardScheduler': [
        AgentCapability.ContentWrite,
        AgentCapability.Publish,
    ],
    'DashboardController.deleteDashboardCustomMetric': [AgentCapability.Delete],
    'DashboardController.getDashboardHistory': [AgentCapability.ReadDiscover],
    'DashboardController.getDashboardSchedulers': [
        AgentCapability.ReadDiscover,
    ],
    'DashboardController.getDashboardVersion': [AgentCapability.ReadDiscover],
    'DashboardController.postDashboardVersionRollback': [
        AgentCapability.ContentWrite,
    ],
    'DashboardController.promoteDashboard': [AgentCapability.Publish],
    'DashboardController.promoteDashboardDiff': [AgentCapability.ReadDiscover],
    'DashboardController.unverifyDashboard': [AgentCapability.Publish],
    'DashboardController.updateDashboardCustomMetric': [
        AgentCapability.ContentWrite,
    ],
    'DashboardController.verifyDashboard': [AgentCapability.Publish],
    'DashboardControllerV2.exportDashboardContent': [AgentCapability.Export],
    'DashboardControllerV2.getDashboardSchedulerRuns': [
        AgentCapability.ReadDiscover,
    ],
    'DashboardControllerV2.getDashboardSchedulers': [
        AgentCapability.ReadDiscover,
    ],
    'DataAppAnalysisController.detect': [AgentCapability.Query],
    'DataAppAnalysisController.getAnalysis': [AgentCapability.ReadDiscover],
    'DataAppAnalysisController.investigate': [AgentCapability.Query],
    'DataAppAnalysisController.lookup': [AgentCapability.ReadDiscover],
    'DataAppAnalysisController.prompt': [AgentCapability.Query],
    'DatabricksSSOController.get': [AgentCapability.ReadDiscover],
    'DeployController.addDeployBatch': [AgentCapability.DeployUpload],
    'DeployController.deployExplores': [AgentCapability.DeployUpload],
    'DeployController.finalizeDeploySession': [AgentCapability.DeployUpload],
    'DeployController.startDeploySession': [AgentCapability.DeployUpload],
    'DirectAccessController.listDirectAccessAssignments': [
        AgentCapability.ReadDiscover,
    ],
    'DirectAccessController.listDirectAccessGroups': [
        AgentCapability.ReadDiscover,
    ],
    'DirectAccessController.listDirectAccessUsers': [
        AgentCapability.ReadDiscover,
    ],
    'DirectAccessController.resetDirectAccessAssignments': [
        AgentCapability.Publish,
        AgentCapability.Administration,
    ],
    'DirectAccessController.revokeDirectAccessAssignment': [
        AgentCapability.Publish,
        AgentCapability.Administration,
    ],
    'DirectAccessController.upsertDirectAccessAssignment': [
        AgentCapability.Publish,
        AgentCapability.Administration,
    ],
    'DocumentController.create': [AgentCapability.ContentWrite],
    'DocumentController.duplicate': [AgentCapability.ContentWrite],
    'DocumentController.executeChartQuery': [AgentCapability.Query],
    'DocumentController.exportPdf': [AgentCapability.Export],
    'DocumentController.get': [AgentCapability.ReadDiscover],
    'DocumentController.getAsCode': [AgentCapability.ReadDiscover],
    'DocumentController.getPromotionDiff': [AgentCapability.ReadDiscover],
    'DocumentController.getVersion': [AgentCapability.ReadDiscover],
    'DocumentController.list': [AgentCapability.ReadDiscover],
    'DocumentController.listDocumentsLinkingChart': [
        AgentCapability.ReadDiscover,
    ],
    'DocumentController.listVersions': [AgentCapability.ReadDiscover],
    'DocumentController.promote': [AgentCapability.Publish],
    'DocumentController.togglePin': [AgentCapability.ContentWrite],
    'DocumentController.unverify': [AgentCapability.Publish],
    'DocumentController.updateContent': [AgentCapability.ContentWrite],
    'DocumentController.updateMetadata': [AgentCapability.ContentWrite],
    'DocumentController.verify': [AgentCapability.Publish],
    'EmailWhitelabelController.deleteEmailWhitelabel': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'EmailWhitelabelController.getEmailWhitelabel': [
        AgentCapability.ReadDiscover,
    ],
    'EmailWhitelabelController.setupEmailWhitelabel': [
        AgentCapability.Administration,
    ],
    'EmailWhitelabelController.updateEmailWhitelabel': [
        AgentCapability.Administration,
    ],
    'EmailWhitelabelController.verifyEmailWhitelabel': [
        AgentCapability.Administration,
    ],
    'EmbedController.getEmbedConfig': [AgentCapability.ReadDiscover],
    'EmbedController.getEmbedUrl': [
        AgentCapability.Publish,
        AgentCapability.Administration,
    ],
    'EmbedController.saveEmbedConfig': [
        AgentCapability.Publish,
        AgentCapability.Administration,
    ],
    'EmbedController.updateEmbedConfig': [
        AgentCapability.Publish,
        AgentCapability.Administration,
    ],
    'EmbedController.updateEmbeddedDashboards': [
        AgentCapability.Publish,
        AgentCapability.Administration,
    ],
    'ExploreController.CheckPreAggregate': [AgentCapability.Query],
    'ExploreController.CompileQuery': [AgentCapability.Query],
    'ExploreController.GetExplore': [AgentCapability.ReadDiscover],
    'ExploreController.GetExplores': [AgentCapability.ReadDiscover],
    'ExploreController.SetExplores': [AgentCapability.DeployUpload],
    'ExploreController.ValidateFormula': [AgentCapability.Query],
    'ExploreController.getChartsByExploreName': [AgentCapability.ReadDiscover],
    'ExternalConnectionController.createExternalConnection': [
        AgentCapability.Administration,
    ],
    'ExternalConnectionController.deleteExternalConnection': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'ExternalConnectionController.deleteExternalConnectionSample': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'ExternalConnectionController.externalFetch': [
        AgentCapability.ExternalTools,
    ],
    'ExternalConnectionController.getExternalConnection': [
        AgentCapability.ReadDiscover,
    ],
    'ExternalConnectionController.linkAppExternalConnection': [
        AgentCapability.Administration,
    ],
    'ExternalConnectionController.listAppExternalConnections': [
        AgentCapability.ReadDiscover,
    ],
    'ExternalConnectionController.listExternalConnectionLinkedApps': [
        AgentCapability.ReadDiscover,
    ],
    'ExternalConnectionController.listExternalConnectionSamples': [
        AgentCapability.ReadDiscover,
    ],
    'ExternalConnectionController.listExternalConnections': [
        AgentCapability.ReadDiscover,
    ],
    'ExternalConnectionController.proposeExternalConnectionConfig': [
        AgentCapability.Administration,
    ],
    'ExternalConnectionController.rotateExternalConnectionSecret': [
        AgentCapability.Administration,
    ],
    'ExternalConnectionController.saveExternalConnectionSample': [
        AgentCapability.Administration,
    ],
    'ExternalConnectionController.testExternalConnection': [
        AgentCapability.Administration,
    ],
    'ExternalConnectionController.testExternalConnectionConfig': [
        AgentCapability.Administration,
    ],
    'ExternalConnectionController.unlinkAppExternalConnection': [
        AgentCapability.Administration,
    ],
    'ExternalConnectionController.updateExternalConnection': [
        AgentCapability.Administration,
    ],
    'ExternalSourceController.commitUpload': [
        AgentCapability.DeployUpload,
        AgentCapability.Administration,
    ],
    'ExternalSourceController.createGoogleSheetsSource': [
        AgentCapability.Administration,
    ],
    'ExternalSourceController.deleteSource': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'ExternalSourceController.getSource': [AgentCapability.ReadDiscover],
    'ExternalSourceController.listSources': [AgentCapability.ReadDiscover],
    'ExternalSourceController.previewTable': [AgentCapability.Query],
    'ExternalSourceController.reconnectSource': [
        AgentCapability.Administration,
    ],
    'ExternalSourceController.refreshSource': [AgentCapability.Administration],
    'ExternalSourceController.replaceCsv': [
        AgentCapability.DeployUpload,
        AgentCapability.Administration,
    ],
    'ExternalSourceController.updateSource': [AgentCapability.Administration],
    'ExternalSourceController.uploadCsv': [
        AgentCapability.DeployUpload,
        AgentCapability.Administration,
    ],
    'FavoritesController.getFavorites': [AgentCapability.ReadDiscover],
    'FavoritesController.toggleFavorite': [AgentCapability.ContentWrite],
    'FeatureFlagController.deleteFeatureFlagOverride': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'FeatureFlagController.getFeatureFlag': [AgentCapability.ReadDiscover],
    'FeatureFlagController.listFeatureFlags': [AgentCapability.ReadDiscover],
    'FeatureFlagController.setFeatureFlagOverride': [
        AgentCapability.Administration,
    ],
    'FileController.getFile': [AgentCapability.Export],
    'FunnelController.getEventNames': [AgentCapability.Query],
    'FunnelController.runFunnelQuery': [AgentCapability.Query],
    'GeoJsonProxyController.get': [AgentCapability.ReadDiscover],
    'GitFilesController.createBranch': [AgentCapability.DbtWriteback],
    'GitFilesController.createPullRequest': [AgentCapability.DbtWriteback],
    'GitFilesController.deleteFile': [
        AgentCapability.Delete,
        AgentCapability.DbtWriteback,
    ],
    'GitFilesController.getFileOrDirectory': [AgentCapability.ReadDiscover],
    'GitFilesController.listBranches': [AgentCapability.ReadDiscover],
    'GitFilesController.saveFile': [AgentCapability.DbtWriteback],
    'GitIntegrationController.CreatePullRequestForCustomDimensions': [
        AgentCapability.DbtWriteback,
    ],
    'GitIntegrationController.CreatePullRequestForCustomMetrics': [
        AgentCapability.DbtWriteback,
    ],
    'GitIntegrationController.PreviewPullRequestForCustomDimensions': [
        AgentCapability.ReadDiscover,
    ],
    'GitIntegrationController.createPullRequestForFileChange': [
        AgentCapability.DbtWriteback,
    ],
    'GitIntegrationController.getFileForExplore': [
        AgentCapability.ReadDiscover,
    ],
    'GitIntegrationController.getFilePathForExplore': [
        AgentCapability.ReadDiscover,
    ],
    'GoogleDriveController.get': [AgentCapability.ReadDiscover],
    'GoogleDriveController.post': [AgentCapability.Export],
    'GoogleDriveController.postFromRows': [AgentCapability.Export],
    'GroupsController.addProjectAccessToGroup': [
        AgentCapability.Publish,
        AgentCapability.Administration,
    ],
    'GroupsController.addUserToGroup': [AgentCapability.Administration],
    'GroupsController.deleteGroup': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'GroupsController.getGroup': [AgentCapability.ReadDiscover],
    'GroupsController.getGroupMembers': [AgentCapability.ReadDiscover],
    'GroupsController.removeProjectAccessFromGroup': [
        AgentCapability.Publish,
        AgentCapability.Administration,
    ],
    'GroupsController.removeUserFromGroup': [AgentCapability.Administration],
    'GroupsController.updateGroup': [AgentCapability.Administration],
    'GroupsController.updateProjectAccessForGroup': [
        AgentCapability.Publish,
        AgentCapability.Administration,
    ],
    'HomepageRecommendedActionSkipsController.list': [
        AgentCapability.ReadDiscover,
    ],
    'HomepageRecommendedActionSkipsController.skip': [
        AgentCapability.Administration,
    ],
    'HomepageRecommendedActionSkipsController.unskip': [
        AgentCapability.Administration,
    ],
    'InviteLinksController.createInviteLink': [AgentCapability.Administration],
    'InviteLinksController.revokeAllInviteLinks': [
        AgentCapability.Administration,
    ],
    'ManagedAgentController.getActions': [AgentCapability.ReadDiscover],
    'ManagedAgentController.getLatestRun': [AgentCapability.ReadDiscover],
    'ManagedAgentController.getRuns': [AgentCapability.ReadDiscover],
    'ManagedAgentController.getRuntimeInfo': [AgentCapability.ReadDiscover],
    'ManagedAgentController.getSettings': [AgentCapability.ReadDiscover],
    'ManagedAgentController.reverseAction': [AgentCapability.Administration],
    'ManagedAgentController.runHeartbeat': [AgentCapability.Administration],
    'ManagedAgentController.updateSettings': [AgentCapability.Administration],
    'MapTileController.getTile': [AgentCapability.ReadDiscover],
    'MetricsExplorerController.compileMetricTotalQuery': [
        AgentCapability.Query,
    ],
    'MetricsExplorerController.runMetricSeries': [AgentCapability.Query],
    'MetricsExplorerController.runMetricTotal': [AgentCapability.Query],
    'MobilePushNotificationController.getMobilePushNotificationStatus': [
        AgentCapability.ReadDiscover,
    ],
    'MobilePushNotificationController.registerInstallation': [
        AgentCapability.Administration,
    ],
    'MobilePushNotificationController.registerLiveActivityPushToStartToken': [
        AgentCapability.Administration,
    ],
    'MobilePushNotificationController.revokeInstallation': [
        AgentCapability.Administration,
    ],
    'NotificationsController.getNotifications': [AgentCapability.ReadDiscover],
    'NotificationsController.updateNotification': [
        AgentCapability.Administration,
    ],
    'OnboardingAgentController.cancelRun': [AgentCapability.Administration],
    'OnboardingAgentController.createRun': [AgentCapability.Administration],
    'OnboardingAgentController.getActiveRun': [AgentCapability.ReadDiscover],
    'OnboardingAgentController.getFile': [AgentCapability.ReadDiscover],
    'OnboardingAgentController.getRun': [AgentCapability.ReadDiscover],
    'OrgAppsController.getDataAppActivity': [AgentCapability.ReadDiscover],
    'OrgRoadmapController.followProject': [AgentCapability.Administration],
    'OrgRoadmapController.getOrgRoadmap': [AgentCapability.ReadDiscover],
    'OrgRoadmapController.getProjects': [AgentCapability.ReadDiscover],
    'OrganizationAgentIdentityController.getProjectsWithoutAiServiceAccount': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationAgentIdentityController.getSettings': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationAgentIdentityController.getSnowflakeSetup': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationAgentIdentityController.saveSnowflakeAgentClient': [
        AgentCapability.Administration,
    ],
    'OrganizationAgentIdentityController.updateRule': [
        AgentCapability.Administration,
    ],
    'OrganizationAgentIdentityController.updateSettings': [
        AgentCapability.Administration,
    ],
    'OrganizationAgentIdentityController.verifySnowflakeSetup': [
        AgentCapability.Administration,
    ],
    'OrganizationCoderController.getCustomRolesAsCode': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationCoderController.getGroupsAsCode': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationCoderController.getUserAttributesAsCode': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationCoderController.getUsersAsCode': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationCoderController.legacyGetCustomRolesAsCode': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationCoderController.legacyGetGroupsAsCode': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationCoderController.legacyGetUsersAsCode': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationCoderController.legacyUpsertCustomRoleAsCode': [
        AgentCapability.Administration,
    ],
    'OrganizationCoderController.legacyUpsertGroupAsCode': [
        AgentCapability.Administration,
    ],
    'OrganizationCoderController.legacyUpsertUserAsCode': [
        AgentCapability.Administration,
    ],
    'OrganizationCoderController.upsertCustomRoleAsCode': [
        AgentCapability.Administration,
    ],
    'OrganizationCoderController.upsertGroupAsCode': [
        AgentCapability.Administration,
    ],
    'OrganizationCoderController.upsertUserAsCode': [
        AgentCapability.Administration,
    ],
    'OrganizationCoderController.upsertUserAttributeAsCode': [
        AgentCapability.Administration,
    ],
    'OrganizationController.createColorPalette': [
        AgentCapability.Administration,
    ],
    'OrganizationController.createGroup': [AgentCapability.Administration],
    'OrganizationController.createOrganization': [
        AgentCapability.Administration,
    ],
    'OrganizationController.createProject': [
        AgentCapability.DeployUpload,
        AgentCapability.Administration,
    ],
    'OrganizationController.deleteColorPalette': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'OrganizationController.deleteUser': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'OrganizationController.enableLearn': [AgentCapability.Administration],
    'OrganizationController.ensurePlaygroundProject': [
        AgentCapability.DeployUpload,
        AgentCapability.Administration,
    ],
    'OrganizationController.fetchOrganizationBrand': [
        AgentCapability.Administration,
    ],
    'OrganizationController.getColorPalettes': [AgentCapability.ReadDiscover],
    'OrganizationController.getImpersonationSettings': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationController.getLearnAccess': [AgentCapability.ReadDiscover],
    'OrganizationController.getOrganization': [AgentCapability.ReadDiscover],
    'OrganizationController.getOrganizationBrand': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationController.getOrganizationMemberByEmail': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationController.getOrganizationMemberByUuid': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationController.getOrganizationMembers': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationController.getProjects': [AgentCapability.ReadDiscover],
    'OrganizationController.getUserDashboardsSummary': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationController.getUserSchedulersSummary': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationController.listGroupsInOrganization': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationController.reassignUserDashboards': [
        AgentCapability.Administration,
    ],
    'OrganizationController.reassignUserSchedulers': [
        AgentCapability.Administration,
    ],
    'OrganizationController.saveOrganizationBrand': [
        AgentCapability.Administration,
    ],
    'OrganizationController.setActiveColorPalette': [
        AgentCapability.Administration,
    ],
    'OrganizationController.updateColorPalette': [
        AgentCapability.Administration,
    ],
    'OrganizationController.updateImpersonationSettings': [
        AgentCapability.Administration,
    ],
    'OrganizationController.updateOrganizationMember': [
        AgentCapability.Administration,
    ],
    'OrganizationDesignController.clearDefaultDesign': [
        AgentCapability.Administration,
    ],
    'OrganizationDesignController.createDesign': [
        AgentCapability.Administration,
    ],
    'OrganizationDesignController.deleteAllFiles': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'OrganizationDesignController.deleteDesign': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'OrganizationDesignController.deleteFile': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'OrganizationDesignController.downloadFile': [AgentCapability.Export],
    'OrganizationDesignController.downloadPackage': [AgentCapability.Export],
    'OrganizationDesignController.getDesign': [AgentCapability.ReadDiscover],
    'OrganizationDesignController.importPackage': [
        AgentCapability.DeployUpload,
        AgentCapability.Administration,
    ],
    'OrganizationDesignController.listDesigns': [AgentCapability.ReadDiscover],
    'OrganizationDesignController.setAsDefault': [
        AgentCapability.Administration,
    ],
    'OrganizationDesignController.updateDesign': [
        AgentCapability.Administration,
    ],
    'OrganizationDesignController.uploadFile': [
        AgentCapability.DeployUpload,
        AgentCapability.Administration,
    ],
    'OrganizationDomainVerificationController.confirmVerification': [
        AgentCapability.Administration,
    ],
    'OrganizationDomainVerificationController.deleteVerifiedDomain': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'OrganizationDomainVerificationController.listVerifiedDomains': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationDomainVerificationController.requestVerification': [
        AgentCapability.Administration,
    ],
    'OrganizationHomepageSettingsController.getSettings': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationHomepageSettingsController.updateSettings': [
        AgentCapability.Administration,
    ],
    'OrganizationRolesController.duplicateRole': [
        AgentCapability.Administration,
    ],
    'OrganizationRolesController.getCustomRoleByUuid': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationRolesController.getOrganizationRoleAssignments': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationRolesController.getOrganizationRoles': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationRolesController.getOrganizationUserRoleSet': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationRolesController.replaceOrganizationUserRoleSet': [
        AgentCapability.Administration,
    ],
    'OrganizationRolesController.upsertOrganizationUserRoleAssignment': [
        AgentCapability.Administration,
    ],
    'OrganizationSettingsController.getOrganizationSettings': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationSettingsController.updateOrganizationSettings': [
        AgentCapability.Administration,
    ],
    'OrganizationSsoController.deleteAzureAdConfig': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'OrganizationSsoController.deleteGenericOidcConfig': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'OrganizationSsoController.deleteGoogleConfig': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'OrganizationSsoController.deleteOktaConfig': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'OrganizationSsoController.deleteOneLoginConfig': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'OrganizationSsoController.getAzureAdConfig': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationSsoController.getGenericOidcConfig': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationSsoController.getGoogleConfig': [AgentCapability.ReadDiscover],
    'OrganizationSsoController.getOktaConfig': [AgentCapability.ReadDiscover],
    'OrganizationSsoController.getOneLoginConfig': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationSsoController.upsertAzureAdConfig': [
        AgentCapability.Administration,
    ],
    'OrganizationSsoController.upsertGenericOidcConfig': [
        AgentCapability.Administration,
    ],
    'OrganizationSsoController.upsertGoogleConfig': [
        AgentCapability.Administration,
    ],
    'OrganizationSsoController.upsertOktaConfig': [
        AgentCapability.Administration,
    ],
    'OrganizationSsoController.upsertOneLoginConfig': [
        AgentCapability.Administration,
    ],
    'OrganizationWarehouseCredentialsController.create': [
        AgentCapability.Administration,
    ],
    'OrganizationWarehouseCredentialsController.delete': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'OrganizationWarehouseCredentialsController.get': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationWarehouseCredentialsController.getAll': [
        AgentCapability.ReadDiscover,
    ],
    'OrganizationWarehouseCredentialsController.update': [
        AgentCapability.Administration,
    ],
    'ParametersController.getParameters': [AgentCapability.ReadDiscover],
    'ParametersController.getParametersList': [AgentCapability.ReadDiscover],
    'ParametersController.replaceParameters': [AgentCapability.Administration],
    'PinningController.get': [AgentCapability.ReadDiscover],
    'PinningController.post': [AgentCapability.ContentWrite],
    'PreAggregateController.getDashboardPreAggregateAudit': [
        AgentCapability.ReadDiscover,
    ],
    'PreAggregateController.getPreAggregateMaterializations': [
        AgentCapability.ReadDiscover,
    ],
    'PreAggregateController.getPreAggregateStats': [
        AgentCapability.ReadDiscover,
    ],
    'PreAggregateController.runDashboardPreAggregateAudit': [
        AgentCapability.Query,
    ],
    'ProjectAnnouncementsController.create': [AgentCapability.ContentWrite],
    'ProjectAnnouncementsController.delete': [AgentCapability.Delete],
    'ProjectAnnouncementsController.list': [AgentCapability.ReadDiscover],
    'ProjectAnnouncementsController.update': [AgentCapability.ContentWrite],
    'ProjectAnnouncementsController.uploadImage': [
        AgentCapability.DeployUpload,
    ],
    'ProjectCoderController.dismissContentDraft': [
        AgentCapability.ContentWrite,
    ],
    'ProjectCoderController.getAiAgentsAsCode': [AgentCapability.ReadDiscover],
    'ProjectCoderController.getAlertsAsCode': [AgentCapability.ReadDiscover],
    'ProjectCoderController.getChartsAsCode': [AgentCapability.ReadDiscover],
    'ProjectCoderController.getCodeSpaces': [AgentCapability.ReadDiscover],
    'ProjectCoderController.getContentAsCodeSettings': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectCoderController.getContentAsCodeUploadAdvisory': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectCoderController.getContentDraftReview': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectCoderController.getContentDraftStaleness': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectCoderController.getDashboardsAsCode': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectCoderController.getDocumentsAsCode': [AgentCapability.ReadDiscover],
    'ProjectCoderController.getExternalConnectionsAsCode': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectCoderController.getGoogleSheetsSyncsAsCode': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectCoderController.getHomepagesAsCode': [AgentCapability.ReadDiscover],
    'ProjectCoderController.getScheduledDeliveriesAsCode': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectCoderController.getSpacesAsCode': [AgentCapability.ReadDiscover],
    'ProjectCoderController.getSqlChartsAsCode': [AgentCapability.ReadDiscover],
    'ProjectCoderController.getVirtualViewsAsCode': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectCoderController.legacyGetAiAgentsAsCode': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectCoderController.legacyGetAlertsAsCode': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectCoderController.legacyGetChartsAsCode': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectCoderController.legacyGetDashboardsAsCode': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectCoderController.legacyGetGoogleSheetsSyncsAsCode': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectCoderController.legacyGetScheduledDeliveriesAsCode': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectCoderController.legacyGetSqlChartsAsCode': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectCoderController.legacyGetVirtualViewsAsCode': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectCoderController.legacyUpsertAiAgentsAsCode': [
        AgentCapability.Administration,
    ],
    'ProjectCoderController.legacyUpsertAlertAsCode': [
        AgentCapability.ContentWrite,
        AgentCapability.Publish,
    ],
    'ProjectCoderController.legacyUpsertChartAsCode': [
        AgentCapability.ContentWrite,
    ],
    'ProjectCoderController.legacyUpsertDashboardAsCode': [
        AgentCapability.ContentWrite,
    ],
    'ProjectCoderController.legacyUpsertGoogleSheetsSyncAsCode': [
        AgentCapability.ContentWrite,
    ],
    'ProjectCoderController.legacyUpsertScheduledDeliveryAsCode': [
        AgentCapability.ContentWrite,
        AgentCapability.Publish,
    ],
    'ProjectCoderController.legacyUpsertSqlChartAsCode': [
        AgentCapability.RawSql,
        AgentCapability.ContentWrite,
    ],
    'ProjectCoderController.legacyUpsertVirtualViewAsCode': [
        AgentCapability.RawSql,
        AgentCapability.ContentWrite,
    ],
    'ProjectCoderController.listContentAsCodeWritebacks': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectCoderController.listContentDrafts': [AgentCapability.ReadDiscover],
    'ProjectCoderController.proposeChartToGit': [AgentCapability.DbtWriteback],
    'ProjectCoderController.proposeDashboardToGit': [
        AgentCapability.DbtWriteback,
    ],
    'ProjectCoderController.pullContentAsCodeFromGit': [
        AgentCapability.DbtWriteback,
        AgentCapability.ContentWrite,
    ],
    'ProjectCoderController.rebaseContentDraft': [AgentCapability.ContentWrite],
    'ProjectCoderController.renameContentSlug': [AgentCapability.ContentWrite],
    'ProjectCoderController.reopenContentDraft': [AgentCapability.ContentWrite],
    'ProjectCoderController.stampContentAsCodeSettings': [
        AgentCapability.Administration,
    ],
    'ProjectCoderController.upsertAiAgentsAsCode': [
        AgentCapability.Administration,
    ],
    'ProjectCoderController.upsertAlertAsCode': [
        AgentCapability.ContentWrite,
        AgentCapability.Publish,
    ],
    'ProjectCoderController.upsertChartAsCode': [AgentCapability.ContentWrite],
    'ProjectCoderController.upsertCodeSpace': [AgentCapability.ContentWrite],
    'ProjectCoderController.upsertDashboardAsCode': [
        AgentCapability.ContentWrite,
    ],
    'ProjectCoderController.upsertDocumentAsCode': [
        AgentCapability.ContentWrite,
    ],
    'ProjectCoderController.upsertExternalConnectionAsCode': [
        AgentCapability.Administration,
    ],
    'ProjectCoderController.upsertGoogleSheetsSyncAsCode': [
        AgentCapability.ContentWrite,
    ],
    'ProjectCoderController.upsertHomepageAsCode': [
        AgentCapability.ContentWrite,
    ],
    'ProjectCoderController.upsertScheduledDeliveryAsCode': [
        AgentCapability.ContentWrite,
        AgentCapability.Publish,
    ],
    'ProjectCoderController.upsertSpaceAsCode': [AgentCapability.ContentWrite],
    'ProjectCoderController.upsertSqlChartAsCode': [
        AgentCapability.RawSql,
        AgentCapability.ContentWrite,
    ],
    'ProjectCoderController.upsertVirtualViewAsCode': [
        AgentCapability.RawSql,
        AgentCapability.ContentWrite,
    ],
    'ProjectCoderController.writeBackContentDraft': [
        AgentCapability.DbtWriteback,
    ],
    'ProjectCompileLogController.getProjectCompileLogByJob': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectCompileLogController.getProjectCompileLogs': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectController.CalculateSubtotalsFromQuery': [AgentCapability.Query],
    'ProjectController.CalculateTotalFromQuery': [AgentCapability.Query],
    'ProjectController.CompileMergeQuery': [AgentCapability.Query],
    'ProjectController.GetDbtExposures': [AgentCapability.ReadDiscover],
    'ProjectController.RunMergeQuery': [AgentCapability.Query],
    'ProjectController.createDashboard': [AgentCapability.ContentWrite],
    'ProjectController.createDashboardWithCharts': [
        AgentCapability.ContentWrite,
    ],
    'ProjectController.createPreview': [
        AgentCapability.DeployUpload,
        AgentCapability.Administration,
    ],
    'ProjectController.createTag': [AgentCapability.ContentWrite],
    'ProjectController.deleteTag': [AgentCapability.Delete],
    'ProjectController.getAgentSqlScope': [AgentCapability.ReadDiscover],
    'ProjectController.getChartSummariesInProject': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectController.getChartsInProject': [AgentCapability.ReadDiscover],
    'ProjectController.getCustomMetrics': [AgentCapability.ReadDiscover],
    'ProjectController.getDashboards': [AgentCapability.ReadDiscover],
    'ProjectController.getMergedManifest': [AgentCapability.ReadDiscover],
    'ProjectController.getProject': [AgentCapability.ReadDiscover],
    'ProjectController.getProjectAccessList': [AgentCapability.ReadDiscover],
    'ProjectController.getProjectColorPalette': [AgentCapability.ReadDiscover],
    'ProjectController.getProjectGroupAccesses': [AgentCapability.ReadDiscover],
    'ProjectController.getProjectMember': [AgentCapability.ReadDiscover],
    'ProjectController.getProjectPreviewExpirationSettings': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectController.getProjectResultsCacheSettings': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectController.getProjectTableGroups': [AgentCapability.ReadDiscover],
    'ProjectController.getProjectUserWarehouseCredentials': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectController.getSharedSignInStatus': [AgentCapability.ReadDiscover],
    'ProjectController.getSpacesInProject': [AgentCapability.ReadDiscover],
    'ProjectController.getTags': [AgentCapability.ReadDiscover],
    'ProjectController.getUpstreamDiff': [AgentCapability.ReadDiscover],
    'ProjectController.getUserWarehouseCredentialsPreference': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectController.grantProjectAccessToUser': [
        AgentCapability.Publish,
        AgentCapability.Administration,
    ],
    'ProjectController.listVerifiedContent': [AgentCapability.ReadDiscover],
    'ProjectController.previewDataTimezone': [AgentCapability.Administration],
    'ProjectController.reconnectSharedSignIn': [AgentCapability.Administration],
    'ProjectController.refresh': [AgentCapability.DeployUpload],
    'ProjectController.refreshPreAggregateByDefinitionName': [
        AgentCapability.Query,
    ],
    'ProjectController.refreshPreAggregates': [AgentCapability.Query],
    'ProjectController.replaceProjectTableGroups': [
        AgentCapability.Administration,
    ],
    'ProjectController.replaceYamlTags': [AgentCapability.ContentWrite],
    'ProjectController.revokeProjectAccessForUser': [
        AgentCapability.Publish,
        AgentCapability.Administration,
    ],
    'ProjectController.runSqlQuery': [AgentCapability.RawSql],
    'ProjectController.testWarehouseConnection': [
        AgentCapability.Administration,
    ],
    'ProjectController.updateAgentSqlScope': [AgentCapability.Administration],
    'ProjectController.updateDashboards': [AgentCapability.ContentWrite],
    'ProjectController.updateDefaultUserSpaces': [
        AgentCapability.Administration,
    ],
    'ProjectController.updatePreviewExpiresAt': [
        AgentCapability.Administration,
    ],
    'ProjectController.updateProjectAccessForUser': [
        AgentCapability.Publish,
        AgentCapability.Administration,
    ],
    'ProjectController.updateProjectColorPalette': [
        AgentCapability.Administration,
    ],
    'ProjectController.updateProjectDetails': [
        AgentCapability.DeployUpload,
        AgentCapability.Administration,
    ],
    'ProjectController.updateProjectMetadata': [
        AgentCapability.DeployUpload,
        AgentCapability.Administration,
    ],
    'ProjectController.updateProjectPreviewExpirationSettings': [
        AgentCapability.Administration,
    ],
    'ProjectController.updateProjectResultsCacheSettings': [
        AgentCapability.Administration,
    ],
    'ProjectController.updateQueryTimezoneSettings': [
        AgentCapability.Administration,
    ],
    'ProjectController.updateSchedulerSettings': [
        AgentCapability.Administration,
    ],
    'ProjectController.updateTag': [AgentCapability.ContentWrite],
    'ProjectController.updateUserWarehouseCredentialsPreference': [
        AgentCapability.Administration,
    ],
    'ProjectDashboardControllerV2.delete': [AgentCapability.Delete],
    'ProjectDashboardControllerV2.get': [AgentCapability.ReadDiscover],
    'ProjectDashboardControllerV2.getComments': [AgentCapability.ReadDiscover],
    'ProjectDashboardControllerV2.update': [AgentCapability.ContentWrite],
    'ProjectDbtSourcesController.createProjectDbtSource': [
        AgentCapability.Administration,
    ],
    'ProjectDbtSourcesController.deleteProjectDbtSource': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'ProjectDbtSourcesController.getProjectDbtSource': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectDbtSourcesController.listProjectDbtSources': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectDbtSourcesController.updateProjectDbtSource': [
        AgentCapability.Administration,
    ],
    'ProjectDefaultsController.getProjectDefaults': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectDefaultsController.replaceProjectDefaults': [
        AgentCapability.Administration,
    ],
    'ProjectHomepageController.create': [AgentCapability.ContentWrite],
    'ProjectHomepageController.delete': [AgentCapability.Delete],
    'ProjectHomepageController.discardDraft': [AgentCapability.ContentWrite],
    'ProjectHomepageController.getAssignments': [AgentCapability.ReadDiscover],
    'ProjectHomepageController.getForBuilder': [AgentCapability.ReadDiscover],
    'ProjectHomepageController.getLinkMetadata': [AgentCapability.ReadDiscover],
    'ProjectHomepageController.getRecentlyViewed': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectHomepageController.getResolved': [AgentCapability.ReadDiscover],
    'ProjectHomepageController.listHomepages': [AgentCapability.ReadDiscover],
    'ProjectHomepageController.publish': [AgentCapability.Publish],
    'ProjectHomepageController.updateDraft': [AgentCapability.ContentWrite],
    'ProjectHomepageController.updateGroupPriorities': [
        AgentCapability.ContentWrite,
    ],
    'ProjectHomepageController.viewAs': [AgentCapability.ReadDiscover],
    'ProjectRolesController.deleteProjectGroupRoleAssignment': [
        AgentCapability.Publish,
        AgentCapability.Administration,
    ],
    'ProjectRolesController.deleteProjectUserRoleAssignment': [
        AgentCapability.Publish,
        AgentCapability.Administration,
    ],
    'ProjectRolesController.getProjectGroupRoleSet': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectRolesController.getProjectRoleAssignments': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectRolesController.getProjectUserRoleSet': [
        AgentCapability.ReadDiscover,
    ],
    'ProjectRolesController.replaceProjectGroupRoleSet': [
        AgentCapability.Publish,
        AgentCapability.Administration,
    ],
    'ProjectRolesController.replaceProjectUserRoleSet': [
        AgentCapability.Publish,
        AgentCapability.Administration,
    ],
    'ProjectRolesController.updateProjectGroupRoleAssignment': [
        AgentCapability.Publish,
        AgentCapability.Administration,
    ],
    'ProjectRolesController.upsertProjectGroupRoleAssignment': [
        AgentCapability.Publish,
        AgentCapability.Administration,
    ],
    'ProjectRolesController.upsertProjectUserRoleAssignment': [
        AgentCapability.Publish,
        AgentCapability.Administration,
    ],
    'ProjectSavedChartControllerV2.delete': [AgentCapability.Delete],
    'ProjectSavedChartControllerV2.get': [AgentCapability.ReadDiscover],
    'PullRequestsController.listPullRequests': [AgentCapability.ReadDiscover],
    'QueryController.cancelAsyncQuery': [AgentCapability.ReadDiscover],
    'QueryController.downloadResults': [AgentCapability.Export],
    'QueryController.executeAsyncCalculateTotal': [AgentCapability.Query],
    'QueryController.executeAsyncComposeMergeQuery': [AgentCapability.Query],
    'QueryController.executeAsyncComposeSqlQuery': [AgentCapability.RawSql],
    'QueryController.executeAsyncDashboardChartQuery': [AgentCapability.Query],
    'QueryController.executeAsyncDashboardSqlChartQuery': [
        AgentCapability.Query,
        AgentCapability.RawSql,
    ],
    'QueryController.executeAsyncFieldValueSearch': [AgentCapability.Query],
    'QueryController.executeAsyncMergeQuery': [AgentCapability.Query],
    'QueryController.executeAsyncMetricQuery': [AgentCapability.Query],
    'QueryController.executeAsyncSavedChartQuery': [AgentCapability.Query],
    'QueryController.executeAsyncSqlChartQuery': [
        AgentCapability.Query,
        AgentCapability.RawSql,
    ],
    'QueryController.executeAsyncSqlQuery': [AgentCapability.RawSql],
    'QueryController.executeAsyncUnderlyingDataQuery': [AgentCapability.Query],
    'QueryController.getAsyncQueryResults': [AgentCapability.ReadDiscover],
    'QueryController.getQueryHistory': [AgentCapability.ReadDiscover],
    'QueryController.getResultsStream': [AgentCapability.ReadDiscover],
    'QueryController.scheduleDownloadResults': [AgentCapability.Export],
    'QuerySourceController.executeSourceQueries': [AgentCapability.Query],
    'QuerySourceController.getSourceQueryStatus': [
        AgentCapability.ReadDiscover,
    ],
    'QuerySourceController.listQuerySources': [AgentCapability.ReadDiscover],
    'QuerySourceController.scanQuerySourceSchema': [AgentCapability.Query],
    'RenameController.previewRename': [AgentCapability.ReadDiscover],
    'RenameController.rename': [AgentCapability.ContentWrite],
    'RenameController.renameChart': [AgentCapability.ContentWrite],
    'RenameController.renameChartFields': [AgentCapability.ReadDiscover],
    'RenameController.renameDashboardFields': [AgentCapability.ReadDiscover],
    'RenameController.renameDashboardFilter': [AgentCapability.ContentWrite],
    'RunViewChartQueryController.postUnderlyingData': [AgentCapability.Query],
    'RunViewChartQueryController.runMetricQuery': [AgentCapability.Query],
    'SavedChartController.calculateTotalFromSavedChart': [
        AgentCapability.Query,
    ],
    'SavedChartController.createSavedChartScheduler': [
        AgentCapability.ContentWrite,
        AgentCapability.Publish,
    ],
    'SavedChartController.exportSavedChartImage': [AgentCapability.Export],
    'SavedChartController.getChartHistory': [AgentCapability.ReadDiscover],
    'SavedChartController.getChartVersion': [AgentCapability.ReadDiscover],
    'SavedChartController.getChartVersionResults': [AgentCapability.Query],
    'SavedChartController.getSavedChartSchedulers': [
        AgentCapability.ReadDiscover,
    ],
    'SavedChartController.postChartResults': [AgentCapability.Query],
    'SavedChartController.postChartVersionRollback': [
        AgentCapability.ContentWrite,
    ],
    'SavedChartController.postDashboardTile': [AgentCapability.Query],
    'SavedChartController.promoteChart': [AgentCapability.Publish],
    'SavedChartController.promoteChartDiff': [AgentCapability.ReadDiscover],
    'SavedChartController.unverifyChart': [AgentCapability.Publish],
    'SavedChartController.verifyChart': [AgentCapability.Publish],
    'SavedChartControllerV2.getSavedChartSchedulerRuns': [
        AgentCapability.ReadDiscover,
    ],
    'SavedChartControllerV2.getSavedChartSchedulers': [
        AgentCapability.ReadDiscover,
    ],
    'SchedulerAiAugmentationController.deleteAugmentation': [
        AgentCapability.Delete,
    ],
    'SchedulerAiAugmentationController.getAugmentation': [
        AgentCapability.ReadDiscover,
    ],
    'SchedulerAiAugmentationController.upsertAugmentation': [
        AgentCapability.ContentWrite,
        AgentCapability.Publish,
    ],
    'SchedulerController.delete': [AgentCapability.Delete],
    'SchedulerController.get': [AgentCapability.ReadDiscover],
    'SchedulerController.getJobs': [AgentCapability.ReadDiscover],
    'SchedulerController.getLogs': [AgentCapability.ReadDiscover],
    'SchedulerController.getRunLogs': [AgentCapability.ReadDiscover],
    'SchedulerController.getRuns': [AgentCapability.ReadDiscover],
    'SchedulerController.getSchedulerStatus': [AgentCapability.ReadDiscover],
    'SchedulerController.getSchedulers': [AgentCapability.ReadDiscover],
    'SchedulerController.getUserSchedulers': [AgentCapability.ReadDiscover],
    'SchedulerController.patch': [
        AgentCapability.ContentWrite,
        AgentCapability.Publish,
    ],
    'SchedulerController.patchEnabled': [
        AgentCapability.ContentWrite,
        AgentCapability.Publish,
    ],
    'SchedulerController.post': [
        AgentCapability.ContentWrite,
        AgentCapability.Publish,
    ],
    'SchedulerController.postByUuid': [
        AgentCapability.ContentWrite,
        AgentCapability.Publish,
    ],
    'SchedulerController.reassignOwner': [
        AgentCapability.ContentWrite,
        AgentCapability.Publish,
    ],
    'ScimOrganizationAccessTokenController.getOrganizationAccessToken': [
        AgentCapability.ReadDiscover,
    ],
    'ScimOrganizationAccessTokenController.getOrganizationAccessTokens': [
        AgentCapability.ReadDiscover,
    ],
    'ScimOrganizationAccessTokenController.rotateOrganizationAccessToken': [
        AgentCapability.Administration,
    ],
    'ScimRequestLogController.getScimRequestLogs': [
        AgentCapability.ReadDiscover,
    ],
    'ServiceAccountsController.getServiceAccountProjectGrants': [
        AgentCapability.ReadDiscover,
    ],
    'ServiceAccountsController.getServiceAccounts': [
        AgentCapability.ReadDiscover,
    ],
    'ServiceAccountsController.rotateServiceAccount': [
        AgentCapability.Administration,
    ],
    'ServiceAccountsController.updateServiceAccount': [
        AgentCapability.Administration,
    ],
    'ShareController.create': [AgentCapability.Publish],
    'ShareController.get': [AgentCapability.ReadDiscover],
    'SlackController.get': [AgentCapability.ReadDiscover],
    'SlackController.getChannelById': [AgentCapability.ReadDiscover],
    'SlackController.updateCustomSettings': [AgentCapability.Administration],
    'SnowflakeController.ssoIsAuthenticated': [AgentCapability.ReadDiscover],
    'SpaceController.addSpaceGroupAccess': [
        AgentCapability.Publish,
        AgentCapability.Administration,
    ],
    'SpaceController.addSpaceUserAccess': [
        AgentCapability.Publish,
        AgentCapability.Administration,
    ],
    'SpaceController.createSpace': [AgentCapability.ContentWrite],
    'SpaceController.deleteSpace': [AgentCapability.Delete],
    'SpaceController.getDeleteImpact': [AgentCapability.ReadDiscover],
    'SpaceController.getPersonalSpace': [AgentCapability.ReadDiscover],
    'SpaceController.getSpace': [AgentCapability.ReadDiscover],
    'SpaceController.getSpaceAccessList': [AgentCapability.ReadDiscover],
    'SpaceController.getSpaceServiceAccountCandidates': [
        AgentCapability.ReadDiscover,
    ],
    'SpaceController.revokeGroupSpaceAccess': [
        AgentCapability.Publish,
        AgentCapability.Administration,
    ],
    'SpaceController.revokeSpaceAccessForUser': [
        AgentCapability.Publish,
        AgentCapability.Administration,
    ],
    'SpaceController.updateSpace': [AgentCapability.ContentWrite],
    'SpotlightController.getSpotlightTableConfig': [
        AgentCapability.ReadDiscover,
    ],
    'SpotlightController.postSpotlightTableConfig': [
        AgentCapability.ContentWrite,
    ],
    'SpotlightController.resetSpotlightTableConfig': [
        AgentCapability.ContentWrite,
    ],
    'SqlRunnerConnectionsController.getSqlRunnerConnectionDatabases': [
        AgentCapability.RawSql,
    ],
    'SqlRunnerConnectionsController.getSqlRunnerConnectionTableFields': [
        AgentCapability.RawSql,
    ],
    'SqlRunnerConnectionsController.getSqlRunnerConnectionTables': [
        AgentCapability.RawSql,
    ],
    'SqlRunnerConnectionsController.listSqlRunnerConnections': [
        AgentCapability.RawSql,
    ],
    'SqlRunnerConnectionsController.refreshSqlRunnerConnectionCatalog': [
        AgentCapability.RawSql,
    ],
    'SqlRunnerController.createSqlChart': [
        AgentCapability.RawSql,
        AgentCapability.ContentWrite,
    ],
    'SqlRunnerController.createSqlChartScheduler': [
        AgentCapability.ContentWrite,
        AgentCapability.Publish,
    ],
    'SqlRunnerController.createVirtualView': [
        AgentCapability.RawSql,
        AgentCapability.ContentWrite,
    ],
    'SqlRunnerController.deleteSqlChart': [AgentCapability.Delete],
    'SqlRunnerController.deleteVirtualView': [AgentCapability.Delete],
    'SqlRunnerController.getLocalResults': [AgentCapability.ReadDiscover],
    'SqlRunnerController.getSavedSqlChart': [AgentCapability.ReadDiscover],
    'SqlRunnerController.getSavedSqlChartBySlug': [
        AgentCapability.ReadDiscover,
    ],
    'SqlRunnerController.getSavedSqlResultsJob': [
        AgentCapability.Query,
        AgentCapability.RawSql,
    ],
    'SqlRunnerController.getSavedSqlResultsJobByUuid': [
        AgentCapability.Query,
        AgentCapability.RawSql,
    ],
    'SqlRunnerController.getSqlChartSchedulers': [AgentCapability.ReadDiscover],
    'SqlRunnerController.getTableFields': [AgentCapability.RawSql],
    'SqlRunnerController.getTables': [AgentCapability.RawSql],
    'SqlRunnerController.promoteSqlChart': [AgentCapability.Publish],
    'SqlRunnerController.promoteSqlChartDiff': [AgentCapability.ReadDiscover],
    'SqlRunnerController.refreshSqlRunnerCatalog': [AgentCapability.RawSql],
    'SqlRunnerController.runSql': [AgentCapability.RawSql],
    'SqlRunnerController.runSqlPivotQuery': [AgentCapability.RawSql],
    'SqlRunnerController.updateSqlChart': [
        AgentCapability.RawSql,
        AgentCapability.ContentWrite,
    ],
    'SqlRunnerController.updateVirtualView': [
        AgentCapability.RawSql,
        AgentCapability.ContentWrite,
    ],
    'SqlRunnerController.writeBackCreatePr': [AgentCapability.DbtWriteback],
    'SqlRunnerController.writeBackPreview': [AgentCapability.ReadDiscover],
    'SupportController.shareSupport': [AgentCapability.Administration],
    'UserActivityController.exportUserActivityCsv': [AgentCapability.Export],
    'UserActivityController.getDownloadActivity': [
        AgentCapability.ReadDiscover,
    ],
    'UserActivityController.getUserActivity': [AgentCapability.ReadDiscover],
    'UserAppsController.listMyApps': [AgentCapability.ReadDiscover],
    'UserAttributesController.createUserAttribute': [
        AgentCapability.Administration,
    ],
    'UserAttributesController.getUserAttributes': [
        AgentCapability.ReadDiscover,
    ],
    'UserAttributesController.removeUserAttribute': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'UserAttributesController.updateUserAttribute': [
        AgentCapability.Administration,
    ],
    'UserAvatarController.deleteMyAvatar': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'UserAvatarController.updateMyAvatar': [AgentCapability.Administration],
    'UserController.completeRedshiftAwsSsoWarehouseCredentials': [
        AgentCapability.Administration,
    ],
    'UserController.completeUserOnboardingTour': [
        AgentCapability.Administration,
    ],
    'UserController.createPersonalAccessToken': [
        AgentCapability.Administration,
    ],
    'UserController.createWarehouseCredentials': [
        AgentCapability.Administration,
    ],
    'UserController.deleteWarehouseCredentials': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'UserController.getAccount': [AgentCapability.ReadDiscover],
    'UserController.getAuthenticatedUser': [AgentCapability.ReadDiscover],
    'UserController.getEmailVerificationStatus': [
        AgentCapability.Administration,
    ],
    'UserController.getOrganizationsUserCanJoin': [
        AgentCapability.ReadDiscover,
    ],
    'UserController.getPersonalAccessTokens': [AgentCapability.ReadDiscover],
    'UserController.getUserLearnProgress': [AgentCapability.ReadDiscover],
    'UserController.getUserOnboarding': [AgentCapability.ReadDiscover],
    'UserController.getWarehouseCredentials': [AgentCapability.ReadDiscover],
    'UserController.joinOrganization': [AgentCapability.Administration],
    'UserController.markUserLearnScopeCompleted': [
        AgentCapability.Administration,
    ],
    'UserController.markUserLearnScopeStarted': [
        AgentCapability.Administration,
    ],
    'UserController.mergeUserLearnProgress': [AgentCapability.Administration],
    'UserController.rotatePersonalAccessToken': [
        AgentCapability.Administration,
    ],
    'UserController.startRedshiftAwsSsoWarehouseCredentials': [
        AgentCapability.Administration,
    ],
    'UserController.updateWarehouseCredentials': [
        AgentCapability.Administration,
    ],
    'UserService.verifyEmail': [AgentCapability.Administration],
    'UsersAvatarController.getUserAvatar': [AgentCapability.ReadDiscover],
    'ValidationController.dismiss': [AgentCapability.Administration],
    'ValidationController.get': [AgentCapability.ReadDiscover],
    'ValidationController.post': [AgentCapability.Administration],
    'ValidationController.validateChart': [AgentCapability.Administration],
    'ValidationController.validateDashboard': [AgentCapability.Administration],
    'ValidationControllerV2.get': [AgentCapability.ReadDiscover],
    'ValidationControllerV2.list': [AgentCapability.ReadDiscover],
    'ValidationControllerV2.summary': [AgentCapability.ReadDiscover],
    'WarehouseConnectionBindingController.bindDbtSourceToWarehouseConnection': [
        AgentCapability.Administration,
    ],
    'WarehouseConnectionBindingController.getDbtSourceWarehouseConnectionBindings':
        [AgentCapability.ReadDiscover],
    'WarehouseConnectionController.createWarehouseConnection': [
        AgentCapability.Administration,
    ],
    'WarehouseConnectionController.deleteWarehouseConnection': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'WarehouseConnectionController.getWarehouseConnection': [
        AgentCapability.ReadDiscover,
    ],
    'WarehouseConnectionController.getWarehouseConnectionUserCredentials': [
        AgentCapability.ReadDiscover,
    ],
    'WarehouseConnectionController.listWarehouseConnections': [
        AgentCapability.ReadDiscover,
    ],
    'WarehouseConnectionController.renameWarehouseConnection': [
        AgentCapability.Administration,
    ],
    'WarehouseConnectionController.updateWarehouseConnection': [
        AgentCapability.Administration,
    ],
    'WarehouseConnectionController.updateWarehouseConnectionUserCredentials': [
        AgentCapability.Administration,
    ],
    'WarehouseConnectionSwitchController.getWarehouseConnectionSwitchAvailability':
        [AgentCapability.ReadDiscover],
    'WarehouseConnectionSwitchController.previewWarehouseConnectionSwitch': [
        AgentCapability.Administration,
    ],
    'WarehouseConnectionSwitchController.switchToMultipleWarehouseConnections':
        [AgentCapability.Administration],
    'WarehouseConnectionUserCredentialsController.listWarehouseConnectionsForUserCredentials':
        [AgentCapability.ReadDiscover],
    'apiV1Router GET /health': [AgentCapability.ReadDiscover],
    'chartRegistryAssetRouter GET /assets': [AgentCapability.ReadDiscover],
    'dashboardRouter DELETE /:dashboardUuid': [AgentCapability.Delete],
    'dashboardRouter GET /:dashboardUuid/views': [AgentCapability.ReadDiscover],
    'dashboardRouter GET /:dashboardUuidOrSlug': [AgentCapability.ReadDiscover],
    'dashboardRouter GET /:dashboardUuidOrSlug/view-stats': [
        AgentCapability.ReadDiscover,
    ],
    'dashboardRouter PATCH /:dashboardUuid/pinning': [
        AgentCapability.ContentWrite,
    ],
    'dashboardRouter PATCH /:dashboardUuidOrSlug': [
        AgentCapability.ContentWrite,
    ],
    'dashboardRouter POST /:dashboardUuid/export': [AgentCapability.Export],
    'dashboardRouter POST /:dashboardUuid/exportCsv': [AgentCapability.Export],
    'dashboardRouter POST /availableFilters': [AgentCapability.ReadDiscover],
    'dashboardRouter.getDashboardViews': [AgentCapability.ReadDiscover],
    'jobsRouter GET /:jobUuid': [AgentCapability.ReadDiscover],
    'mcpRouter ALL /': [AgentCapability.ReadDiscover],
    'mcpRouter ALL /projects/:projectUuid': [AgentCapability.ReadDiscover],
    'mcpRouter.handle': [AgentCapability.ReadDiscover],
    'oauthRouter DELETE /clients/:clientId': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'oauthRouter GET /clients': [AgentCapability.ReadDiscover],
    'oauthRouter GET /userinfo': [AgentCapability.ReadDiscover],
    'oauthRouter PATCH /clients/:clientId': [AgentCapability.Administration],
    'oauthRouter POST /clients': [AgentCapability.Administration],
    'organizationRouter DELETE /projects/:projectUuid': [
        AgentCapability.Delete,
        AgentCapability.Administration,
    ],
    'organizationRouter GET /access': [AgentCapability.ReadDiscover],
    'organizationRouter GET /jobs/create-project/active': [
        AgentCapability.ReadDiscover,
    ],
    'organizationRouter GET /onboardingStatus': [AgentCapability.ReadDiscover],
    'organizationRouter POST /onboardingStatus/shownSuccess': [
        AgentCapability.Administration,
    ],
    'organizationRouter POST /projects/precompiled': [
        AgentCapability.DeployUpload,
        AgentCapability.Administration,
    ],
    'organizationRouter.getActiveCreateProjectJob': [
        AgentCapability.ReadDiscover,
    ],
    'organizationRouter.getOnboarding': [AgentCapability.ReadDiscover],
    'organizationRouter.getOrganizationAccess': [AgentCapability.ReadDiscover],
    'organizationRouter.setOnboardingSuccessDate': [
        AgentCapability.Administration,
    ],
    'projectRouter GET /catalog': [AgentCapability.ReadDiscover],
    'projectRouter GET /csv/:nanoId': [AgentCapability.Export],
    'projectRouter GET /hasSavedCharts': [AgentCapability.ReadDiscover],
    'projectRouter GET /most-popular-and-recently-updated': [
        AgentCapability.ReadDiscover,
    ],
    'projectRouter GET /search/:query': [AgentCapability.ReadDiscover],
    'projectRouter GET /tablesConfiguration': [AgentCapability.ReadDiscover],
    'projectRouter GET /verified-content-homepage': [
        AgentCapability.ReadDiscover,
    ],
    'projectRouter PATCH /': [
        AgentCapability.DeployUpload,
        AgentCapability.Administration,
    ],
    'projectRouter PATCH /saved': [AgentCapability.ContentWrite],
    'projectRouter PATCH /spaces/:spaceUuid/pinning': [
        AgentCapability.ContentWrite,
    ],
    'projectRouter PATCH /tablesConfiguration': [
        AgentCapability.Administration,
    ],
    'projectRouter POST /field/:fieldId/search': [AgentCapability.Query],
    'projectRouter POST /saved': [AgentCapability.ContentWrite],
    'projectRouter PUT /warehouse-credentials': [
        AgentCapability.Administration,
    ],
    'savedChartRouter DELETE /:savedQueryUuid': [AgentCapability.Delete],
    'savedChartRouter GET /:savedQueryUuid/availableFilters': [
        AgentCapability.ReadDiscover,
    ],
    'savedChartRouter GET /:savedQueryUuid/views': [
        AgentCapability.ReadDiscover,
    ],
    'savedChartRouter GET /:savedQueryUuidOrSlug': [
        AgentCapability.ReadDiscover,
    ],
    'savedChartRouter PATCH /:savedQueryUuid': [AgentCapability.ContentWrite],
    'savedChartRouter PATCH /:savedQueryUuid/pinning': [
        AgentCapability.ContentWrite,
    ],
    'savedChartRouter POST /:savedQueryUuid/version': [
        AgentCapability.ContentWrite,
    ],
} as const satisfies Record<string, RequiredAgentCapabilities>;

const capabilityMaps = {
    mcp: MCP_TOOL_CAPABILITIES,
    agent: AGENT_TOOL_CAPABILITIES,
    rest: REST_OPERATION_CAPABILITIES,
} as const;

export type AgentCapabilityOperationKind = keyof typeof capabilityMaps;

export const getRequiredAgentCapabilities = (
    kind: AgentCapabilityOperationKind,
    key: string,
): RequiredAgentCapabilities | null => {
    const map: Readonly<Record<string, RequiredAgentCapabilities>> =
        capabilityMaps[kind];
    return Object.hasOwn(map, key) ? map[key] : null;
};

export const getConnectedMcpToolCapabilities =
    (): RequiredAgentCapabilities => [AgentCapability.ExternalTools];
