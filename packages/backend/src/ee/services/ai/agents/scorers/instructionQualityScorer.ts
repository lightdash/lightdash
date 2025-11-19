import {
    InstructionQualityEvaluation,
    InstructionQualitySchema,
    ScorerContext,
} from '@lightdash/common';
import { generateObject, type LanguageModel } from 'ai';

const INSTRUCTION_EVALUATION_PROMPT = `You are evaluating custom instructions for a Lightdash AI agent specialized in data analytics and exploration.

## What This Agent Does

The Lightdash AI agent helps users:
- **Query and visualize data** from explores (data models with dimensions and metrics)
- **Create charts and tables** (bar, line, scatter, pie, funnel, horizontal bar, table)
- **Find existing content** (dashboards and saved charts)
- **Perform data analysis** with filters, table calculations, and custom metrics
- **Search field values** within dimensions

The agent follows strict rules:
- Must use existing explores and fields (cannot write custom SQL)
- Interprets requests as data retrieval tasks (e.g., "what is total revenue?" means run a query)
- Uses specific tools: findExplores, findFields, runQuery, findContent, searchFieldValues
- Always starts by finding relevant explores and fields
- Prefers table visualizations when using table calculations

## Evaluation Criteria

Good instructions should help the agent understand YOUR business context and preferences. Focus on:

### 1. **Data Context & Usage Guidance** (MOST ESSENTIAL)
This is the most critical criterion. Instructions should help the agent choose the RIGHT explore and fields when multiple options exist.

- **Explore selection guidance**: Which explores to use for specific questions
  - Critical when explores overlap (e.g., orders vs payments for revenue questions)
  - Examples:
    - "For total revenue questions, use the 'payments' explore - it has the most accurate revenue data"
    - "Use 'orders' explore for order counts and customer behavior, use 'payments' for actual revenue"
    - "The 'customers' explore is for demographic analysis, use 'subscriptions' for recurring revenue"
- **Field selection guidance**: Which fields to use when multiple options exist
  - Examples:
    - "Use 'net_revenue' field instead of 'gross_revenue' for financial reporting"
    - "For customer location, use 'billing_country' not 'shipping_country'"
- **Relationships between data sources**: How explores connect and when to use each
  - Examples:
    - "Orders contain line items, use for item-level analysis. Use order_summary for order-level metrics"
    - "User activity logs are in 'events' explore, user profiles are in 'users' explore"
- **Filtering rules and data quality notes**:
  - Examples:
    - "Always exclude orders with status='test' or status='cancelled'"
    - "Revenue data before January 2023 is incomplete"
- **Seasonal patterns and anomalies**:
  - Examples:
    - "Q4 shows 40% higher sales due to holiday promotions - this is expected"
    - "Traffic drops on weekends - focus on weekday comparisons"

### 2. **Industry Context & Terminology** (Essential)
- Define industry-specific terms, acronyms, and jargon
- Clarify how key metrics are calculated in your business
- Explain business-specific concepts the agent should know
- Examples:
  - "CPM means Cost Per Mille (per thousand impressions), not cost per mile"
  - "MRR is Monthly Recurring Revenue, calculated as sum of active subscriptions"
  - "Churn rate should exclude test accounts and free trials"

### 3. **Analysis Preferences** (Important)
- Preferred comparison methods (YoY, MoM, QoQ, etc.)
- Default time windows for analysis
- Performance thresholds that matter
- Key metrics to prioritize or focus on
- Examples:
  - "Always compare month-over-month growth for revenue metrics"
  - "Focus on MRR, churn rate, and customer acquisition cost"
  - "Alert if conversion rate drops below 15%"

### 4. **Business Constraints** (Helpful)
- Regulatory or compliance requirements
- Budget limitations or business rules
- Decision-making parameters
- Examples:
  - "Must comply with GDPR - never show individual user data"
  - "Marketing spend decisions are made for campaigns over $10k"

## What to Avoid

❌ **Redundant instructions about basic features** - The agent already knows how to create charts, find explores, etc.
  - Bad: "Create visualizations" / "Make charts" / "Find data"

❌ **Too many focus areas** - Agents should be specialized, not general-purpose
  - Bad: Covering sales, marketing, finance, operations, HR all in one agent

❌ **Vague or generic guidance** - Be specific and actionable
  - Bad: "Be helpful" / "Analyze data well"
  - Good: "Focus on subscription metrics: MRR, churn, LTV"

❌ **Conflicting or ambiguous instructions**
  - Bad: "Use both 'revenue' and 'net_revenue' interchangeably"

❌ **Instructions about unsupported features** - Agent has limitations
  - Cannot write custom SQL or create custom dimensions
  - Cannot do statistical forecasting
  - Cannot modify underlying database

## Scoring Guidelines

**Data Context & Usage Guidance is WEIGHTED MOST HEAVILY** - this criterion is critical for agent effectiveness.

- **Score 5 (Excellent)**: Includes strong data context guidance (explore/field selection) PLUS 2+ other criteria with specific guidance. Instructions are clear, focused, and highly actionable.
- **Score 4 (Good)**: Includes good data context guidance OR covers 2-3 criteria well. Clear instructions but missing critical explore selection guidance or could be more comprehensive.
- **Score 3 (Fair)**: Limited data context guidance, or covers 1-2 other criteria with some specificity. Basic guidance but lacks explore selection clarity.
- **Score 2 (Poor)**: Missing data context guidance and instructions are vague/generic. May include redundant basic features or be too broad.
- **Score 1 (Very Poor)**: No useful business context. Instructions are confusing, contradictory, or provide no actionable guidance.

## Your Task

Evaluate the instructions considering (in priority order):
1. **MOST IMPORTANT**: Do they provide explore/field selection guidance to help choose between similar data sources?
2. Do they provide other specific business context the agent can act on?
3. Are they focused on this agent's specialized domain (not trying to do everything)?
4. Do they avoid redundant instructions about basic chart creation?
5. Are they clear and non-conflicting?
6. Do they match the agent's scope and available explores?

Provide 2-5 specific, actionable recommendations. If missing explore selection guidance, this MUST be the #1 recommendation.`;

/**
 * Analyzes agent instruction quality using LLM evaluation against best practices
 */
export async function evaluateInstructionQuality(
    model: LanguageModel,
    context: ScorerContext,
): Promise<InstructionQualityEvaluation> {
    const { agentInstructions, simplifiedExplores } = context;

    const hasInstructions =
        agentInstructions && agentInstructions.trim().length > 0;

    // Prepare context about the agent's scope for the LLM
    const agentScope = {
        exploreCount: simplifiedExplores.length,
        exploreNames: simplifiedExplores
            .slice(0, 20)
            .map((e) => e.label || e.name),
        hasMoreExplores: simplifiedExplores.length > 20,
    };

    const evaluationContext = hasInstructions
        ? `
## Agent Scope
- Total explores: ${agentScope.exploreCount}
- Explore names: ${agentScope.exploreNames.join(', ')}${
              agentScope.hasMoreExplores
                  ? `, and ${agentScope.exploreCount - 20} more`
                  : ''
          }

## Custom Instructions
${agentInstructions}

Evaluate these instructions based on the criteria above. Focus especially on whether they provide explore selection guidance to help disambiguate between similar explores.`
        : `
## Agent Scope
- Total explores: ${agentScope.exploreCount}
- Explore names: ${agentScope.exploreNames.join(', ')}${
              agentScope.hasMoreExplores
                  ? `, and ${agentScope.exploreCount - 20} more`
                  : ''
          }

## Custom Instructions
No custom instructions have been provided.

Analyze the available explores and identify:
1. Whether there are explores with potentially overlapping purposes that would benefit from selection guidance (e.g., multiple explores that could answer revenue questions)
2. What critical context is missing that would help the agent choose the right data sources
3. Specific recommendations for what instructions should include based on the available explores

Be concrete and reference specific explore names when making recommendations.`;

    try {
        const { object } = await generateObject({
            model,
            schema: InstructionQualitySchema,
            prompt: `${INSTRUCTION_EVALUATION_PROMPT}\n\n${evaluationContext}`,
        });

        // If no instructions, always return score 0 (won't count toward overall)
        // but keep the LLM's recommendations which analyzed the explores
        if (!hasInstructions) {
            return {
                score: 0,
                recommendations: object.recommendations,
            };
        }

        return object;
    } catch (error) {
        // Fallback if LLM call fails
        if (!hasInstructions) {
            return {
                score: 0,
                recommendations: [
                    'No custom instructions provided',
                    'Add instructions to guide the AI agent with explore selection guidance, industry context, and analysis priorities',
                ],
            };
        }

        return {
            score: 3,
            recommendations: [
                'Unable to evaluate instruction quality automatically',
                'Review instructions against best practices: provide explore selection guidance, industry context, and analysis priorities',
            ],
        };
    }
}
