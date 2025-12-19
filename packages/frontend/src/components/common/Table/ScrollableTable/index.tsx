import { FeatureFlags } from '@lightdash/common';
import { useRef, type FC } from 'react';
import { useFeatureFlagEnabled } from '../../../../hooks/useFeatureFlagEnabled';
import { Table, TableScrollableWrapper } from '../Table.styles';
import { useTableContext } from '../useTableContext';
import TableBody from './TableBody';
import TableFooter from './TableFooter';
import TableHeader from './TableHeader';

interface ScrollableTableProps {
    minimal?: boolean;
    showSubtotals?: boolean;
    isDashboard?: boolean;
}

const ScrollableTable: FC<ScrollableTableProps> = ({
    minimal = true,
    showSubtotals = true,
    isDashboard = false,
}) => {
    const { footer } = useTableContext();
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const isDashboardRedesignEnabled = useFeatureFlagEnabled(
        FeatureFlags.DashboardRedesign,
    );

    return (
        <TableScrollableWrapper
            ref={tableContainerRef}
            $isDashboard={isDashboard && isDashboardRedesignEnabled}
        >
            <Table $showFooter={!!footer?.show}>
                <TableHeader minimal={minimal} showSubtotals={showSubtotals} />
                <TableBody
                    tableContainerRef={tableContainerRef}
                    minimal={minimal}
                />
                <TableFooter />
            </Table>
        </TableScrollableWrapper>
    );
};

export default ScrollableTable;
