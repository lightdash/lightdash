import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { AiGroupMappingsEditor } from './AiGroupMappingsEditor';
import { hasDuplicateRefs } from './validation';
describe('AI group mappings', () => {
    it('flags duplicate references before saving, including whitespace', () => {
        const value = [
            { groupUuid: 'a', ref: 'ai_reader', priority: 0 },
            { groupUuid: 'b', ref: ' ai_reader ', priority: 1 },
        ];
        renderWithProviders(
            <AiGroupMappingsEditor
                value={value}
                groups={[
                    { value: 'a', label: 'Group A' },
                    { value: 'b', label: 'Group B' },
                ]}
                onChange={vi.fn()}
            />,
        );
        expect(
            screen.getAllByText('Principal references must be unique'),
        ).toHaveLength(2);
        expect(hasDuplicateRefs(value)).toBe(true);
        expect(
            hasDuplicateRefs([
                { ...value[0], ref: 'one' },
                { ...value[1], ref: 'two' },
            ]),
        ).toBe(false);
    });
});
