import {
    ChatPromptTemplate,
    HumanMessagePromptTemplate,
    SystemMessagePromptTemplate,
} from '@langchain/core/prompts';

// TODO: Test prompt with chart config as well as chart + dashboard filters

const BASE_SYSTEM_PROMPT = SystemMessagePromptTemplate.fromTemplate(
    `You are a helpful assistant designed to answer questions using data analytics.

Strictly adhere to the following guidelines when answering questions:

1. Your answers should always come in the form of a single stream of text.
2. Keep your answers concise and to the point while ensuring they are informative and relevant to the question asked.
3. Avoid making assumptions or extrapolating beyond the scope of the available data.`,
);

const BASE_CHART_SUMMARY_HUMAN_PROMPT = HumanMessagePromptTemplate.fromTemplate(
    `You will be shown chart data as a csv table with a header row.
The data in the table represents data used for a chart called "{chart_name}" with the following description "{chart_description}".

The chart data is made up of the following dimensions and metrics:
<dimensions_metrics>
{field_insights}
</dimensions_metrics>

<chart_data>
{chart_data}
</chart_data>

Summarise the data provided while following these guidelines:
1. The summary should *NEVER* be just a description of the data. Analise the data as a whole and formulate insights and observations from it.
2. Always include data that supports the insights and observations presented in the summary.
3. Return only the insights and observations and nothing else. Do not include any other information in the response.`,
);

const BASE_DASHBOARD_SUMMARY_HUMAN_PROMPT =
    HumanMessagePromptTemplate.fromTemplate(
        `The following insights and observations were drawn from the data of individual charts in a dashboard.
<insights_observations>
{chart_summaries}
</insights_observations>

Summarise the provided data insights and observations into a concise dashboard summary while following these guidelines:
<guidelines>
1. Ensure the summary doesn't simply restate the insights and observations but provides a concise overview of the data.
2. Always include data that supports the conclusions drawn in the summary.
3. When applicable, find relationships in the data and draw conclusions based on these relationships.
4. The summary needs to be in Markdown.
5. Do not include a title in the markdown summary.
6. Do not wrap the markdown content in a code block.
7. Return only the markdown summary and nothing else. Do not include any other information in the response.
</guidelines>

Additional context has been provided to help you understand the data better.
<additional_context>
{context}
</additional_context>

<tone>
Write the summary in a tone that is {tone} while keeping it professional.
</tone>

<audience>
The audiences for this summary are the following: {audiences}. Ensure the summary is tailored to them.
</audience>
`,
    );

export const DEFAULT_CHART_SUMMARY_PROMPT = new ChatPromptTemplate({
    promptMessages: [BASE_SYSTEM_PROMPT, BASE_CHART_SUMMARY_HUMAN_PROMPT],
    inputVariables: [
        ...BASE_SYSTEM_PROMPT.inputVariables,
        ...BASE_CHART_SUMMARY_HUMAN_PROMPT.inputVariables,
    ],
});

export const DEFAULT_DASHBOARD_SUMMARY_PROMPT = new ChatPromptTemplate({
    promptMessages: [BASE_SYSTEM_PROMPT, BASE_DASHBOARD_SUMMARY_HUMAN_PROMPT],
    inputVariables: [
        ...BASE_SYSTEM_PROMPT.inputVariables,
        ...BASE_DASHBOARD_SUMMARY_HUMAN_PROMPT.inputVariables,
    ],
});
