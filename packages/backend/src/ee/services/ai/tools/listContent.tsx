import {
    ContentType,
    listContentToolDefinition,
    type ToolListContentStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { ListContentFn } from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    listContent: ListContentFn;
};

const toolDefinition = listContentToolDefinition.for('agent');

const toStructuredContent = (
    content: Awaited<ReturnType<ListContentFn>>,
): ToolListContentStructuredContent => ({
    spaceSlug: content.spaceSlug,
    pagination: content.pagination ?? {
        page: 1,
        pageSize: content.items.length,
        totalResults: content.items.length,
        totalPageCount: 1,
    },
    items: content.items,
});

const renderContent = ({
    spaceSlug,
    pagination,
    items,
}: ToolListContentStructuredContent) => (
    <contentList
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalResults={pagination.totalResults}
        totalPageCount={pagination.totalPageCount}
        spaceSlug={spaceSlug ?? ''}
    >
        {items.map((item) => {
            if (item.contentType === ContentType.SPACE) {
                return (
                    <content
                        contentType={item.contentType}
                        name={item.name}
                        slug={item.slug}
                        href={item.href}
                        chartCount={item.chartCount}
                        dashboardCount={item.dashboardCount}
                        childSpaceCount={item.childSpaceCount}
                        appCount={item.appCount}
                        directAccess={item.directAccess}
                    />
                );
            }
            if (item.contentType === ContentType.DOCUMENT) {
                return (
                    <content
                        contentType={item.contentType}
                        uuid={item.uuid}
                        name={item.name}
                        slug={item.slug}
                        href={item.href}
                    />
                );
            }
            return (
                <content
                    contentType={item.contentType}
                    name={item.name}
                    slug={item.slug}
                    href={item.href}
                />
            );
        })}
    </contentList>
);

export const getListContent = ({ listContent }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (
            args,
        ): Promise<
            | ExecuteStructuredToolResult<ToolListContentStructuredContent>
            | ExecuteToolErrorResult
        > => {
            try {
                const structuredContent = toStructuredContent(
                    await listContent({
                        spaceSlug: args.spaceSlug ?? null,
                        page: args.page ?? 1,
                    }),
                );
                return {
                    result: renderContent(structuredContent).toString(),
                    metadata: { status: 'success' },
                    structuredContent,
                };
            } catch (error) {
                return toolErrorOutput(error, 'Error listing content');
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
