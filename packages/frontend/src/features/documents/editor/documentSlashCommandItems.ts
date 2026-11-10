import { IconChartBar, IconLink, IconTable } from '@tabler/icons-react';
import {
    SLASH_COMMAND_ITEMS,
    type SlashCommandItem,
} from '../../../ee/features/homepageBuilder/blocks/markdownEditor/slashCommandItems';

export const createDocumentSlashCommandItems = ({
    onInsertChart,
    onInsertSavedChart = null,
}: {
    /** Opens the chart editor to insert a chart at this document position; null hides the item. */
    onInsertChart: ((position: number) => void) | null;
    /** Opens the saved chart picker at this document position; null hides the item. */
    onInsertSavedChart?: ((position: number) => void) | null;
}): SlashCommandItem[] => [
    ...SLASH_COMMAND_ITEMS,
    {
        id: 'table',
        label: 'Table',
        description: 'Rows and columns',
        icon: IconTable,
        run: (editor, range) =>
            editor
                .chain()
                .focus()
                .deleteRange(range)
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run(),
    },
    ...(onInsertChart
        ? [
              {
                  id: 'chart',
                  label: 'Chart',
                  description: 'Query the semantic layer',
                  icon: IconChartBar,
                  run: (editor, range) => {
                      editor.chain().focus().deleteRange(range).run();
                      onInsertChart(range.from);
                  },
              } satisfies SlashCommandItem,
          ]
        : []),
    ...(onInsertSavedChart
        ? [
              {
                  id: 'saved-chart',
                  label: 'Saved chart',
                  description: 'Link or copy a chart saved in a Space',
                  icon: IconLink,
                  run: (editor, range) => {
                      editor.chain().focus().deleteRange(range).run();
                      onInsertSavedChart(range.from);
                  },
              } satisfies SlashCommandItem,
          ]
        : []),
];
