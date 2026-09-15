import { ContentType } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import ContentTypeFilter from './ContentTypeFilter';

const flag = vi.hoisted(() => ({ data: { enabled: true }, isError: false }));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => flag,
}));

describe('Document content filter', () => {
    const renderFilter = () => {
        const onChange = vi.fn();
        render(
            <MantineProvider>
                <ContentTypeFilter
                    value={undefined}
                    onChange={onChange}
                    options={[
                        ContentType.CHART,
                        ContentType.DASHBOARD,
                        ContentType.DOCUMENT,
                    ]}
                />
            </MantineProvider>,
        );
        return onChange;
    };
    beforeEach(() => {
        flag.data.enabled = true;
        flag.isError = false;
    });
    it('selects Documents alongside existing content types', () => {
        const onChange = renderFilter();
        fireEvent.click(screen.getByRole('radio', { name: 'Documents' }));
        expect(onChange).toHaveBeenCalledWith(ContentType.DOCUMENT);
        expect(
            screen.getByRole('radio', { name: 'Charts' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('radio', { name: 'Dashboards' }),
        ).toBeInTheDocument();
    });
    it.each([
        { enabled: false, error: false },
        { enabled: true, error: true },
    ])('hides Documents when unavailable %j', ({ enabled, error }) => {
        flag.data.enabled = enabled;
        flag.isError = error;
        renderFilter();
        expect(
            screen.queryByRole('radio', { name: 'Documents' }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('radio', { name: 'Charts' }),
        ).toBeInTheDocument();
    });
});
