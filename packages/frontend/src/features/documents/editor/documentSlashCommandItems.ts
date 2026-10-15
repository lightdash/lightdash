import { IconChartBar, IconLink, IconTable } from '@tabler/icons-react';
import {
    SLASH_COMMAND_ITEMS,
    type SlashCommandItem,
} from '../../../ee/features/homepageBuilder/blocks/markdownEditor/slashCommandItems';
import i18n from '../../../i18n/i18n';

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
        label: i18n.t('slashCommands.table.label', { ns: 'documents' }),
        description: i18n.t('slashCommands.table.description', {
            ns: 'documents',
        }),
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
                  label: i18n.t('slashCommands.chart.label', {
                      ns: 'documents',
                  }),
                  description: i18n.t('slashCommands.chart.description', {
                      ns: 'documents',
                  }),
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
                  label: i18n.t('slashCommands.savedChart.label', {
                      ns: 'documents',
                  }),
                  description: i18n.t('slashCommands.savedChart.description', {
                      ns: 'documents',
                  }),
                  icon: IconLink,
                  run: (editor, range) => {
                      editor.chain().focus().deleteRange(range).run();
                      onInsertSavedChart(range.from);
                  },
              } satisfies SlashCommandItem,
          ]
        : []),
];
