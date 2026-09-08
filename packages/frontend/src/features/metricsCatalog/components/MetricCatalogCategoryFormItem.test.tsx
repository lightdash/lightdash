import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GuidedTour } from '../../../components/common/GuidedTour';
import { renderWithProviders } from '../../../testing/testUtils';
import { SCOPE_TOURS } from '../../scopeTours/generated';
import { MetricCatalogCategoryFormItem } from './MetricCatalogCategoryFormItem';

const category = {
    name: 'Revenue',
    color: 'blue',
    tagUuid: 'revenue-tag',
    yamlReference: null,
};

describe('MetricCatalogCategoryFormItem', () => {
    const elementsFromPoint = document.elementsFromPoint;
    beforeEach(() => {
        // jsdom has no layout/hit testing; exercise real tour click handling.
        document.elementsFromPoint = () => [];
    });
    afterEach(() => {
        document.elementsFromPoint = elementsFromPoint;
    });
    it.each(['click', 'Enter', ' '] as const)(
        'selects the category and advances the tutorial from step 4 to step 5 using %s',
        async (action) => {
            const user = userEvent.setup();
            const onClick = vi.fn();
            const onStepChange = vi.fn();
            renderWithProviders(
                <>
                    <MetricCatalogCategoryFormItem
                        category={category}
                        onClick={onClick}
                        canEdit={false}
                    />
                    <GuidedTour
                        steps={SCOPE_TOURS['manage:Tags'].steps}
                        initialStepIndex={3}
                        opened
                        onClose={vi.fn()}
                        onStepChange={onStepChange}
                    />
                </>,
            );

            if (action === 'click') {
                await user.click(screen.getByText('Revenue'));
            } else {
                screen.getByRole('button', { name: 'Revenue' }).focus();
                await user.keyboard(action === 'Enter' ? '{Enter}' : ' ');
            }

            expect(onClick).toHaveBeenCalledTimes(1);
            await waitFor(() =>
                expect(onStepChange).toHaveBeenCalledWith(4, expect.anything()),
            );
        },
    );
});
