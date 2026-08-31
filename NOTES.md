# Notes

## Refactor: built-in tool result guard factory

The four `*ResultLike` + generic type-guard trios in `packages/common/src/ee/AiAgent/schemas/tools/` (`toolEditDbtProjectArgs.ts`, `toolEditRepoArgs.ts`, `toolSetupPreviewDeployArgs.ts`, `toolGenerateDataAppArgs.ts`) are ~25 lines of identical machinery each. The structural `Like` type exists only to dodge a circular import (`AiAgentToolResult` lives in `ee/AiAgent/index.ts`, which imports the schema files); both real call sites pass `AiAgentToolResult`. The `safeParse` matters — persisted metadata comes from the DB.

Replace with one factory in `schemas/tools`, standalone PR off `main` (not in the ZAP-959 stack):

```ts
export const makeBuiltInToolResultGuard =
    <Name extends string, Schema extends z.ZodType>(
        toolName: Name,
        metadataSchema: Schema,
    ) =>
    <T extends { toolType: string; toolName: string; metadata: unknown }>(
        result: T,
    ): result is T & {
        toolType: 'built-in';
        toolName: Name;
        metadata: z.infer<Schema>;
    } =>
        result.toolType === 'built-in' &&
        result.toolName === toolName &&
        metadataSchema.safeParse(result.metadata).success;

// per tool file:
export const isToolGenerateDataAppResult = makeBuiltInToolResultGuard(
    'generateDataApp',
    toolGenerateDataAppOutputSchema.shape.metadata,
);
```

Deletes the `Like`/`Result` pairs in all four files (~80 net lines); next tool's guard becomes a one-liner. Thin wrappers like `isPendingGenerateDataAppToolResult` in `AiAgentModel.ts` stay as-is.
