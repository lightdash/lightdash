import { TaskMeta } from 'vitest';

export const setTaskMeta = <K extends keyof TaskMeta>(
    taskMeta: TaskMeta,
    property: K,
    data: TaskMeta[K],
): void => {
    // eslint-disable-next-line no-param-reassign
    taskMeta[property] = data;
};
