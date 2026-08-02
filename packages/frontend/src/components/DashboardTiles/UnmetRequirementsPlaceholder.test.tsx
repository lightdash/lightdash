import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import UnmetRequirementsPlaceholder from './UnmetRequirementsPlaceholder';

describe('UnmetRequirementsPlaceholder', () => {
    it('renders the placeholder with its filter-exclamation icon', () => {
        const { getByTestId } = renderWithProviders(
            <UnmetRequirementsPlaceholder />,
        );

        const placeholder = getByTestId('unmet-requirements-placeholder');
        expect(placeholder.querySelector('svg')).not.toBeNull();
    });
});
