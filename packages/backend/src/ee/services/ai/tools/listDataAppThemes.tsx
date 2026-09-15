import { listDataAppThemesToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
import type {
    DataAppThemeSummary,
    ListDataAppThemesFn,
} from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    listDataAppThemes: ListDataAppThemesFn;
};

const toolDefinition = listDataAppThemesToolDefinition.for('agent');

const renderTheme = (theme: DataAppThemeSummary) => (
    <theme slug={theme.slug} isDefault={theme.isDefault}>
        <name>{theme.name}</name>
        {theme.description === null ? null : (
            <description>{theme.description}</description>
        )}
    </theme>
);

export const getListDataAppThemes = ({ listDataAppThemes }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async () => {
            try {
                const themes = await listDataAppThemes();
                if (themes.length === 0) {
                    return {
                        result: 'The organization has no themes. Omit themeSlug; tell the user no theme is available if they asked for one.',
                        metadata: { status: 'success' as const },
                    };
                }
                return {
                    result: (
                        <themes count={themes.length}>
                            {themes.map(renderTheme)}
                        </themes>
                    ).toString(),
                    metadata: { status: 'success' as const },
                };
            } catch (e) {
                return {
                    result: toolErrorHandler(e, 'Error listing themes.'),
                    metadata: { status: 'error' as const },
                };
            }
        },
    });
