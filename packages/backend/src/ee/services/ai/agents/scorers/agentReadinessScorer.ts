import {
    AgentReadinessEvaluation,
    AgentReadinessSchema,
    ExploreAnalysisEvaluation,
    MetadataCompletenessEvaluation,
    ScorerContext,
} from '@lightdash/common';
import { generateObject, type LanguageModel } from 'ai';

const getMetadataQualityImpact = (score: number): string => {
    if (score >= 4) {
        return 'Good metadata helps the agent understand explores - custom instructions can focus on business context';
    }
    if (score >= 3) {
        return 'Fair metadata provides some guidance - custom instructions should fill gaps in explore/field understanding';
    }
    return 'Poor metadata means custom instructions are CRITICAL to help the agent understand what explores and fields represent';
};

const getExploreAnalysisAssessment = (score: number): string => {
    if (score >= 4) {
        return 'Agent has a focused scope - good for specialization';
    }
    if (score >= 3) {
        return 'Agent scope is moderate - consider if all explores are needed';
    }
    return 'Agent has too many explores - should likely be split into specialized agents';
};

const INSTRUCTION_EVALUATION_PROMPT = `You are evaluating the overall readiness of a Lightdash AI agent for production use, considering its scope, metadata quality, and custom instructions.

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

## Agent Specialization (Critical for Success)

**Best Practice: Specialized agents perform significantly better than general-purpose agents**

A well-designed agent should:
- ✅ Focus on a specific business domain (e.g., "Marketing Analytics", "Sales Performance", "Finance Reporting")
- ✅ Have explores that are semantically related and serve a common purpose
- ✅ Have 20 or fewer explores for optimal performance
- ❌ NOT try to cover multiple unrelated business areas (e.g., sales + HR + finance + operations)

**How to assess specialization:**
1. Look at explore names and descriptions - do they cluster around a common theme?
2. Would a user asking about one explore likely need data from the others?
3. Could this agent be split into 2+ specialized agents with clearer purposes?

Examples:
- ✅ GOOD: "Sales Assistant" with explores: customers, orders, payments, products, refunds (all sales-related)
- ❌ BAD: "General Analytics" with explores: customers, employees, expenses, inventory, marketing_campaigns (too broad)

## Ambiguous Explores (Common Problem)

**Ambiguous explores** are explores that could serve similar purposes or answer similar questions, creating confusion for the agent.

Common examples:
- "orders" vs "payments" (both could answer "what is total revenue?")
- "users" vs "customers" vs "accounts" (all refer to people/entities)
- "events" vs "activities" vs "logs" (all track actions)
- "products" vs "inventory" vs "catalog" (all related to items)

**How to identify ambiguous explores:**
1. Look for explores with semantically similar names (synonyms, overlapping concepts)
2. Check if explores share similar fields (e.g., both have revenue, both have dates)
3. Consider if a user question could reasonably be answered by multiple explores

**Critical: Custom instructions MUST disambiguate these explores**

When ambiguous explores exist, instructions should explicitly state:
- Which explore to use for which type of question
- How the explores differ in their purpose or data
- Any data quality or completeness differences

Example good instruction:
"For revenue questions, always use 'payments' explore - it has the most accurate revenue data. Use 'orders' explore for order counts and customer behavior analysis, but NOT for revenue calculations."

## Evaluation Criteria

### 1. **Agent Specialization** (CRITICAL)
Analyze whether all explores belong to a cohesive, specialized domain:

**Score 5 (Excellent specialization):**
- All explores clearly serve a single business domain
- Explores have a logical, coherent relationship
- No unrelated or out-of-scope explores

**Score 3 (Partially specialized):**
- Most explores are related, but 2-3 seem out of scope
- Agent tries to cover 2 related domains (e.g., sales + customer service)
- Could be split but still somewhat coherent

**Score 1 (General-purpose agent - problematic):**
- Explores span 3+ unrelated business domains
- No clear theme or specialization
- Agent is trying to be "do everything" assistant

### 2. **Ambiguous Explore Resolution** (CRITICAL)
Identify explores that could be confused or have overlapping purposes:

**Score 5 (Well disambiguated):**
- No ambiguous explores exist, OR
- Ambiguous explores are clearly disambiguated in custom instructions with specific usage guidance

**Score 3 (Partially addressed):**
- Some ambiguous explores exist
- Instructions mention them but lack specific guidance
- User might still be confused about which to use

**Score 1 (Major ambiguity issues):**
- Multiple ambiguous explores exist
- No instructions to help disambiguate
- Agent will likely choose wrong explore for queries

### 3. **Data Context & Usage Guidance** (MOST IMPORTANT for instructions)
When custom instructions exist, they should provide:

- **Explore selection guidance**: Which explores to use for specific questions
- **Field selection guidance**: Which fields to use when multiple options exist
- **Relationships between data sources**: How explores connect
- **Filtering rules and data quality notes**: Always exclude certain data, known limitations
- **Seasonal patterns and anomalies**: Expected variations to be aware of

### 4. **Industry Context & Terminology** (Important for instructions)
- Define industry-specific terms, acronyms, and jargon
- Clarify how key metrics are calculated in your business
- Explain business-specific concepts the agent should know

### 5. **Analysis Preferences** (Helpful for instructions)
- Preferred comparison methods (YoY, MoM, QoQ, etc.)
- Default time windows for analysis
- Performance thresholds that matter
- Key metrics to prioritize or focus on

### 6. **Metadata Quality Impact** (Consider metadata analysis)
Good metadata (descriptions, labels, AI hints) helps the agent understand explores:
- With rich metadata, agent can better understand explore purposes
- With poor metadata, custom instructions become MORE critical to guide the agent
- If both metadata AND instructions are poor, agent will struggle significantly

## Scoring Guidelines

**Your score should reflect the OVERALL readiness of the agent, considering ALL factors:**

- **Score 5 (Production Ready)**:
  - Agent is specialized (focused domain)
  - No ambiguous explores, OR ambiguous explores are clearly disambiguated in instructions
  - Rich metadata OR comprehensive custom instructions (or both)
  - Instructions provide specific, actionable guidance

- **Score 4 (Good, minor improvements needed)**:
  - Agent is mostly specialized (minor scope issues)
  - Any ambiguous explores are addressed in instructions
  - Decent metadata OR good instructions
  - Clear guidance but could be more comprehensive

- **Score 3 (Fair, needs work)**:
  - Agent specialization is unclear or covers 2 domains
  - Some ambiguous explores without clear guidance
  - Limited metadata AND limited instructions
  - Basic guidance but lacks specificity

- **Score 2 (Poor, significant issues)**:
  - Agent is general-purpose (not specialized)
  - Ambiguous explores exist without disambiguation
  - Poor metadata AND poor/missing instructions
  - Vague or generic guidance

- **Score 1 (Not Ready)**:
  - Agent covers many unrelated domains
  - Critical ambiguity issues unresolved
  - Missing both metadata and instructions
  - Confusing or contradictory guidance

## Your Task

Provide a comprehensive evaluation considering:

1. **Agent Specialization**: Analyze explore names/descriptions - are they all related to a single domain?
2. **Ambiguous Explores**: Identify explores that could be confused - are they disambiguated in instructions?
3. **Metadata Quality**: Consider the metadata analysis provided - does it help or hurt?
4. **Custom Instructions**: If present, do they address the specific challenges of THIS agent's explore set?
5. **Overall Readiness**: Combine all factors for a holistic assessment

Provide 2-5 specific, actionable recommendations prioritized by impact:
- If agent is not specialized, this MUST be the #1 recommendation
- If ambiguous explores exist without disambiguation, this MUST be addressed
- Reference specific explore names in your recommendations
- Be concrete and actionable`;

/**
 * Analyzes agent overall readiness using LLM evaluation that considers:
 * - Agent specialization (are explores related to same domain?)
 * - Ambiguous explores (do similar explores need disambiguation?)
 * - Custom instructions quality
 * - Metadata completeness impact
 * - Explore analysis results
 */
export async function evaluateAgentReadiness(
    model: LanguageModel,
    context: ScorerContext,
    metadataCompleteness: MetadataCompletenessEvaluation,
    exploreAnalysis: ExploreAnalysisEvaluation,
): Promise<AgentReadinessEvaluation> {
    const { agentInstructions, simplifiedExplores } = context;

    const exploreDetails = simplifiedExplores.slice(0, 30).map((explore) => {
        const exploreName = explore.label || explore.name;
        const description = explore.description || 'No description';

        let aiHint = 'No AI hint';
        if (explore.aiHint) {
            aiHint = Array.isArray(explore.aiHint)
                ? explore.aiHint.join('; ')
                : explore.aiHint;
        }

        return `- **${exploreName}**: ${description} (AI hint: ${aiHint})`;
    });

    const metadataSummary = `
## Metadata Analysis Results

**Overall Completeness**: ${metadataCompleteness.overallPercentage}% (Score: ${
        metadataCompleteness.score
    }/5)

**Breakdown**:
- ${
        metadataCompleteness.overallMetrics.exploreDescriptionPercentage
    }% of explores have descriptions
- ${
        metadataCompleteness.overallMetrics.exploreAiHintPercentage
    }% of explores have AI hints
- ${
        metadataCompleteness.overallMetrics.fieldDescriptionPercentage
    }% of fields have descriptions

**Metadata Quality Impact**: ${getMetadataQualityImpact(
        metadataCompleteness.score,
    )}

${
    metadataCompleteness.exploreBreakdown.length > 0
        ? `**Explores with lowest metadata scores** (may need more instructions):
${metadataCompleteness.exploreBreakdown
    .slice(0, 5)
    .map((e) => `- ${e.exploreName}: ${e.completenessPercentage}%`)
    .join('\n')}`
        : ''
}`;

    const exploreAnalysisSummary = `
## Explore Analysis Results

**Scope**: ${simplifiedExplores.length} explores (Score: ${
        exploreAnalysis.score
    }/5)

**Focus Assessment**: ${getExploreAnalysisAssessment(exploreAnalysis.score)}

${
    exploreAnalysis.largeExplores.length > 0
        ? `**Large explores** (may be too complex):
${exploreAnalysis.largeExplores.slice(0, 5).join('\n- ')}`
        : ''
}`;

    const evaluationContext = `
## Available Explores (${simplifiedExplores.length} total)

${exploreDetails.join('\n')}${
        simplifiedExplores.length > 30
            ? `\n\n...and ${simplifiedExplores.length - 30} more explores`
            : ''
    }

${metadataSummary}

${exploreAnalysisSummary}

## Custom Instructions

${
    agentInstructions && agentInstructions.trim().length > 0
        ? agentInstructions
        : 'No custom instructions have been provided.'
}

---

## Your Analysis Task

Based on the explores, metadata analysis, and custom instructions above:

1. **Assess Agent Specialization**: Do all explores belong to a coherent, specialized domain? Or is this a general-purpose agent trying to cover too many unrelated areas? Reference specific explore names.

2. **Identify Ambiguous Explores**: Look for explores that have similar names, overlapping purposes, or could answer similar questions. List any you find. Then check if custom instructions disambiguate them.

3. **Evaluate Custom Instructions**: ${
        agentInstructions && agentInstructions.trim().length > 0
            ? 'Do the instructions address the specific challenges of this explore set? Do they disambiguate ambiguous explores? Do they provide explore selection guidance?'
            : 'Since no instructions exist, what specific guidance is needed based on the explores available? What ambiguities need to be addressed?'
    }

4. **Consider Metadata Impact**: Given the metadata quality (${
        metadataCompleteness.score
    }/5), how much do custom instructions need to compensate?

5. **Provide Overall Score**: Score from 1-5 reflecting overall readiness considering specialization, ambiguity resolution, instructions, and metadata.

6. **Give Specific Recommendations**: Provide 2-5 actionable recommendations prioritized by impact, referencing specific explore names.`;

    try {
        const { object } = await generateObject({
            model,
            schema: AgentReadinessSchema,
            prompt: `${INSTRUCTION_EVALUATION_PROMPT}\n\n${evaluationContext}`,
        });

        return object;
    } catch (error) {
        // If anything fails, just return score 0 (invalid evaluation)
        return {
            score: 0,
            recommendations: [
                'Unable to evaluate agent readiness automatically',
                'Review agent configuration: ensure specialization, disambiguate explores, add custom instructions if needed',
            ],
        };
    }
}
