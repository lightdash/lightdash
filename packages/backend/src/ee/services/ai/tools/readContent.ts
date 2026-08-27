import {
    assertUnreachable,
    READ_CONTENT_TYPE_LABELS,
    readContentToolDefinition,
    type ReadContentType,
} from '@lightdash/common';
import { tool } from 'ai';
import type { ReadContentFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    readContent: ReadContentFn;
};

const toolDefinition = readContentToolDefinition.for('agent');

const contentResult = ({
    content,
    href,
    type,
}: {
    content: unknown;
    href: string;
    type: ReadContentType;
}) => `<${type} href="${href}" />\n---\n${JSON.stringify(content, null, 2)}`;

const contentIdentity = (
    result: Awaited<ReturnType<ReadContentFn>>,
): { slug: string; name: string } => {
    switch (result.type) {
        case 'dashboard':
        case 'chart':
            return { slug: result.content.slug, name: result.content.name };
        case 'data_app':
            return {
                slug: result.content.identity.slug,
                name: result.content.identity.name,
            };
        default:
            return assertUnreachable(result, 'Invalid content type');
    }
};

export const getReadContent = ({ readContent }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({ slug, type }) => {
            try {
                const result = await readContent({ slug, type });
                const metadata = {
                    status: 'success' as const,
                    ...contentIdentity(result),
                    href: result.href,
                };

                return {
                    result: contentResult({
                        content: result.content,
                        href: metadata.href,
                        type: result.type,
                    }),
                    metadata,
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        `Error reading ${READ_CONTENT_TYPE_LABELS[type]} "${slug}"`,
                    ),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
