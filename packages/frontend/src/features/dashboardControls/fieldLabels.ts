import i18n from '../../i18n/i18n';

export const joinLabels = (labels: string[]): string =>
    labels.length < 2
        ? labels.join('')
        : i18n.t('controls.labelList', {
              ns: 'dashboardFilters',
              items: labels.slice(0, -1).join(', '),
              last: labels[labels.length - 1],
          });
