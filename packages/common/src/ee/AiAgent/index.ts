export type BaseAiAgent = {
    uuid: string;
    projectUuid: string;
    organizationUuid: string;

    name: string;
    description: string;
    imageUrl: string;

    dataSources: {
        // null means all tags are available
        fieldNameTags: string[] | null; // slack_project_mappings.available_tags
    };

    integrations: {
        type: 'slack';
        channelId: string; // slack_project_mappings.slack_channel_id
    }[];

    createdAt: string;
    updatedAt: string;

    instructions: string;
    provider: 'openai';
    model: 'gpt-4o';
};

export type AiAgent = Pick<
    BaseAiAgent,
    'uuid' | 'projectUuid' | 'organizationUuid' | 'integrations' | 'dataSources'
>;

export type AiAgentSummary = Pick<
    AiAgent,
    'uuid' | 'projectUuid' | 'organizationUuid' | 'integrations' | 'dataSources'
>;

export type AiAgentMessage =
    | {
          role: 'user';
          uuid: string;
          threadUuid: string;
          message: string; // ai_prompt.prompt
          createdAt: string;

          user: {
              uuid: string;
              name: string;
          };
      }
    | {
          role: 'assistant';
          uuid: string;
          threadUuid: string;
          message: string; // ai_prompt.response
          createdAt: string; // ai_prompt.responded_at

          vizConfigOutput?: object;
          filtersOutput?: object;
          metricQuery?: object;
          humanScore?: number;
      };

export type AiAgentThreadSummary = {
    uuid: string;
    agentUuid: string;
    createdAt: string;
    createdFrom: string;
    firstMessage: string;
    user: {
        uuid: string;
        name: string;
    };
};

export type AiAgentThread = AiAgentThreadSummary & {
    messages: AiAgentMessage[];
};

export type ApiAiAgentResponse = {
    status: 'ok';
    results: AiAgent;
};

export type ApiAiAgentSummaryResponse = {
    status: 'ok';
    results: AiAgentSummary[];
};

export type ApiCreateAiAgent = Pick<
    AiAgent,
    'projectUuid' | 'integrations' | 'dataSources'
>;

export type ApiUpdateAiAgent = {
    uuid: AiAgent['uuid'];
    dataSources?: AiAgent['dataSources'];
    integrations?: AiAgent['integrations'];
};

export type ApiCreateAiAgentResponse = {
    status: 'ok';
    results: AiAgent;
};

export type ApiAiAgentThreadSummaryListResponse = {
    status: 'ok';
    results: AiAgentThreadSummary[];
};

export type ApiAiAgentThreadResponse = {
    status: 'ok';
    results: AiAgentThread;
};
