import { generateObject, LanguageModel } from 'ai';
import { z } from 'zod';

const ProjectRoutingSchema = z.object({
    reasoning: z
        .string()
        .describe('One short sentence explaining the decision.'),
    projectUuid: z
        .string()
        .nullable()
        .describe(
            'The UUID of the project the user clearly referred to, or null if the message does not unambiguously identify exactly one of the listed projects.',
        ),
});

/**
 * A lightweight routing pass for the Slack system agent: does the user's
 * message already name exactly one of their projects (e.g. "in the eu project"
 * -> "Jaffle Shop EU")? Returns that project's UUID so the caller can bind the
 * thread to it directly; returns null when no single project is clearly
 * identified, so the caller can ask the user to pick one.
 *
 * Biases hard towards precision: when unsure it returns null (ask the user)
 * rather than guessing, because binding the wrong project is costly.
 */
export async function routeProjectForSlack(
    model: LanguageModel,
    projects: { projectUuid: string; name: string }[],
    userQuery: string,
    metadata: Record<string, string> = {},
): Promise<string | null> {
    if (projects.length === 0) {
        return null;
    }

    const projectList = projects
        .map(
            (project, index) =>
                `${index + 1}. ${project.name} (UUID: ${project.projectUuid})`,
        )
        .join('\n');

    const result = await generateObject({
        model,
        schema: ProjectRoutingSchema,
        experimental_telemetry: {
            functionId: 'routeProjectForSlack',
            isEnabled: true,
            recordInputs: false,
            recordOutputs: false,
            metadata,
        },
        messages: [
            {
                role: 'system',
                content: `You route a user's request to the correct Lightdash project.

The user has access to these projects:
${projectList}

Decide whether the user's message unambiguously refers to exactly ONE of these projects — by name, abbreviation, region, or other clear reference (e.g. "the eu project" or "in EU" -> "Jaffle Shop EU"; "production" -> a project literally named with "production").

Rules:
- If exactly one project is clearly intended, return its exact UUID from the list.
- If the message does not clearly identify a project, names something not in the list, or could plausibly mean more than one, return null.
- Never guess. When in doubt, return null.`,
            },
            {
                role: 'user',
                content: userQuery,
            },
        ],
    });

    const { projectUuid } = result.object;
    if (
        projectUuid &&
        projects.some((project) => project.projectUuid === projectUuid)
    ) {
        return projectUuid;
    }
    return null;
}
