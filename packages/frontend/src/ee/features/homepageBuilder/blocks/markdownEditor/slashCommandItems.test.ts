import { describe, expect, it, vi } from 'vitest';
import {
    createSlashCommandItems,
    SLASH_COMMAND_ITEMS,
} from './slashCommandItems';

describe('createSlashCommandItems', () => {
    it('returns the base list when no onInsertImage callback is provided', () => {
        expect(createSlashCommandItems()).toBe(SLASH_COMMAND_ITEMS);
        expect(createSlashCommandItems({})).toBe(SLASH_COMMAND_ITEMS);
    });

    it('appends an image item when onInsertImage is provided', () => {
        const onInsertImage = vi.fn();
        const items = createSlashCommandItems({ onInsertImage });

        expect(items).toHaveLength(SLASH_COMMAND_ITEMS.length + 1);
        const imageItem = items[items.length - 1];
        expect(imageItem.id).toBe('image');
        expect(imageItem.label).toBe('Image');
    });
});
