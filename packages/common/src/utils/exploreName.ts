import { v5 as uuidv5 } from 'uuid';

export const boundExploreName = (name: string): string => {
    const characters = Array.from(name);
    if (characters.length <= 255) return name;
    const hash = uuidv5(name, uuidv5.URL).slice(0, 8);
    return `${characters.slice(0, 245).join('')}__${hash}`;
};
