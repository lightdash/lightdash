export const pluralizeTiles = (count: number): string =>
    count === 1 ? 'tile' : 'tiles';

export const joinLabels = (labels: string[]): string =>
    labels.length < 2
        ? labels.join('')
        : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
