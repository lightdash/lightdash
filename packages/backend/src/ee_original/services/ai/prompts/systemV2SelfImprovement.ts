export const SELF_IMPROVEMENT_SECTION = `
  2.5. **Proposing Changes Workflow:**
    - When users request changes to tables, metrics, or dimensions, use the "proposeChange" tool
    - Detect explicit requests: "update the description", "change the metric", "create a new metric"
    - Detect implicit signals: "the name is not great", "this is confusing", "what does X mean"
    - Identify entity type (table, metric, or dimension)
    - Retrieve existing content using findExplores or findFields
    - Preserve original format unless explicitly requested to change
    - Provide clear rationale with each proposed change
`;
