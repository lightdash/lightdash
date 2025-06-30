import {
    type AdditionalMetric,
    type CompiledTable,
    type CustomDimension,
} from '@lightdash/common';
import { MantineProvider, NavLink, Text } from '@mantine/core';
import { IconTable } from '@tabler/icons-react';
import type { FC } from 'react';
import { useCallback, useMemo } from 'react';
import { useToggle } from 'react-use';

import { getMantineThemeOverride } from '../../../../mantineTheme';
import { TrackSection } from '../../../../providers/Tracking/TrackingProvider';
import { SectionName } from '../../../../types/Events';
import MantineIcon from '../../../common/MantineIcon';
import { TableItemDetailPreview } from './ItemDetailPreview';
import TableTreeSections from './TableTreeSections';

type TableTreeWrapperProps = {
    isOpen: boolean;
    toggle: () => void;
    table: CompiledTable;
};

const TableTreeWrapper: FC<React.PropsWithChildren<TableTreeWrapperProps>> = ({
    isOpen,
    toggle,
    table,
    children,
}) => {
    const [isHover, toggleHover] = useToggle(false);

    const handleMouseEnter = useCallback(
        () => toggleHover(true),
        [toggleHover],
    );
    const handleMouseLeave = useCallback(
        () => toggleHover(false),
        [toggleHover],
    );
    const handleClosePreview = useCallback(
        () => toggleHover(false),
        [toggleHover],
    );

    const label = useMemo(
        () => (
            <TableItemDetailPreview
                label={table.label}
                description={table.description}
                showPreview={isHover}
                closePreview={handleClosePreview}
            >
                <Text truncate fw={600}>
                    {table.label}
                </Text>
            </TableItemDetailPreview>
        ),
        [table.label, table.description, isHover, handleClosePreview],
    );

    return (
        <NavLink
            opened={isOpen}
            onChange={toggle}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            icon={<MantineIcon icon={IconTable} size="lg" color="gray.7" />}
            label={label}
            styles={{
                root: {
                    top: 0,
                    position: 'sticky' as const,
                    backgroundColor: 'white',
                    zIndex: 1,
                },
            }}
        >
            {/* Don't render children if the table is not open. 
                NOTE: when it is closed, we return a fragment, otherwise 
                it thinks it has no children and doesn't render the button to open.
                This is and issue with mantine 6. 
            */}
            {isOpen ? children : <></>}
        </NavLink>
    );
};

type Props = {
    isOpenByDefault: boolean;
    searchQuery?: string;
    showTableLabel: boolean;
    table: CompiledTable;
    additionalMetrics: AdditionalMetric[];
    selectedItems: Set<string>;
    onSelectedNodeChange: (itemId: string, isDimension: boolean) => void;
    missingCustomMetrics: AdditionalMetric[];
    customDimensions?: CustomDimension[];
    missingCustomDimensions?: CustomDimension[];
    missingFields?: {
        all: string[];
        customDimensions: CustomDimension[] | undefined;
        customMetrics: AdditionalMetric[] | undefined;
    };
    selectedDimensions?: string[];
    searchResults: string[];
    isSearching: boolean;
};

const EmptyWrapper: FC<React.PropsWithChildren<{}>> = ({ children }) => (
    <>{children}</>
);

const themeOverride = getMantineThemeOverride({
    components: {
        NavLink: {
            styles: (theme, _params) => ({
                root: {
                    height: theme.spacing.xxl,
                    padding: `0 ${theme.spacing.sm}`,
                    flexGrow: 0,
                },
                rightSection: {
                    marginLeft: theme.spacing.xxs,
                },
            }),
        },
    },
});

const TableTree: FC<Props> = ({
    isOpenByDefault,
    showTableLabel,
    table,
    additionalMetrics,
    customDimensions,
    missingCustomMetrics,
    missingCustomDimensions,
    searchQuery,
    missingFields,
    selectedDimensions,
    isSearching,
    ...rest
}) => {
    const Wrapper = showTableLabel ? TableTreeWrapper : EmptyWrapper;
    const [isOpen, toggle] = useToggle(isOpenByDefault);

    return (
        <TrackSection name={SectionName.SIDEBAR}>
            <MantineProvider inherit theme={themeOverride}>
                <Wrapper
                    isOpen={isSearching || isOpen}
                    toggle={toggle}
                    table={table}
                >
                    <TableTreeSections
                        table={table}
                        searchQuery={searchQuery}
                        additionalMetrics={additionalMetrics}
                        customDimensions={customDimensions}
                        missingFields={missingFields}
                        selectedDimensions={selectedDimensions}
                        isSearching={isSearching}
                        {...rest}
                    />
                </Wrapper>
            </MantineProvider>
        </TrackSection>
    );
};

export default TableTree;
