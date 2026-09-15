import { ContentType, FeatureFlags } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { ContentTypeFilter } from './ContentTypeFilter';

const mocks = vi.hoisted(() => ({ enabled: true, isError: false }));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: (flag: FeatureFlags) => ({
        data: { enabled: flag === FeatureFlags.Documents && mocks.enabled },
        isError: mocks.isError,
    }),
}));

describe('Recently deleted Document filter', () => {
    it('selects documents', () => {
        mocks.enabled = true;
        mocks.isError = false;
        const onChange = vi.fn();
        render(
            <MantineProvider env="test">
                <ContentTypeFilter
                    selectedContentType="all"
                    setSelectedContentType={onChange}
                />
            </MantineProvider>,
        );
        fireEvent.click(screen.getByLabelText('Documents'));
        expect(onChange).toHaveBeenCalledWith(ContentType.DOCUMENT);
    });
    it.each([
        { enabled: false, isError: false },
        { enabled: true, isError: true },
    ])('hides documents with unavailable flag %j', (flag) => {
        Object.assign(mocks, flag);
        render(
            <MantineProvider env="test">
                <ContentTypeFilter
                    selectedContentType="all"
                    setSelectedContentType={vi.fn()}
                />
            </MantineProvider>,
        );
        expect(screen.queryByLabelText('Documents')).not.toBeInTheDocument();
    });
});
