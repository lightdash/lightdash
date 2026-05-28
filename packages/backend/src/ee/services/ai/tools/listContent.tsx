import {
    ContentType,
    listContentToolDefinition,
    toolListContentOutputSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import type { ListContentFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    listContent: ListContentFn;
};

const toolDefinition = listContentToolDefinition.for('agent');

const renderContent = (content: Awaited<ReturnType<ListContentFn>>) => (
    <contentList
        page={content.pagination?.page ?? 1}
        pageSize={content.pagination?.pageSize ?? content.items.length}
        totalResults={content.pagination?.totalResults ?? content.items.length}
        totalPageCount={content.pagination?.totalPageCount ?? 1}
        spaceSlug={content.spaceSlug ?? ''}
    >
        {content.items.map((item) =>
            item.contentType === ContentType.SPACE ? (
                <content
                    contentType={item.contentType}
                    name={item.name}
                    slug={item.slug}
                    chartCount={item.chartCount}
                    dashboardCount={item.dashboardCount}
                    childSpaceCount={item.childSpaceCount}
                    appCount={item.appCount}
                    directAccess={item.directAccess}
                />
            ) : (
                <content
                    contentType={item.contentType}
                    name={item.name}
                    slug={item.slug}
                />
            ),
        )}
    </contentList>
);

export const getListContent = ({ listContent }: Dependencies) =>
    tool({
        description: toolDefinition.description,
        inputSchema: toolDefinition.inputSchema,
        outputSchema: toolListContentOutputSchema,
        execute: async (args) => {
            try {
                return {
                    result: renderContent(
                        await listContent({
                            spaceSlug: args.spaceSlug ?? null,
                            page: args.page ?? 1,
                        }),
                    ).toString(),
                    metadata: {
                        status: 'success',
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(error, 'Error listing content'),
                    metadata: {
                        status: 'error',
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
