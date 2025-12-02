import type {
    AdditionalMetric,
    CompiledTable,
    CustomDimension,
    Dimension,
    GitIntegrationConfiguration,
    Metric,
    OrderFieldsByStrategy,
} from '@lightdash/common';
import type { Node, NodeItem, NodeMap } from '../Tree/types';

export enum TreeSection {
    Dimensions = 'dimensions',
    Metrics = 'metrics',
    CustomMetrics = 'custom-metrics',
    CustomDimensions = 'custom-dimensions',
    MissingFields = 'missing-fields',
}

/**
 * Builds a unique key for a group node
 * Used consistently across virtualization and tree rendering
 */
export function buildGroupKey(
    tableName: string,
    sectionType: TreeSection,
    nodeKey: string,
    parentPath: string = '',
): string {
    const pathPrefix = parentPath ? `${parentPath}-` : '';
    return `${tableName}-${sectionType}-group-${pathPrefix}${nodeKey}`;
}

/**
 * Builds a unique key for a section context
 * Used to reference shared section data from tree node items
 */
export function buildSectionKey(
    tableName: string,
    sectionType: TreeSection,
): string {
    return `${tableName}-${sectionType}`;
}

// Height constants for different item types (in pixels)
// These must include margins to match actual rendered height
export const ITEM_HEIGHTS = {
    TABLE_HEADER: 32,
    SECTION_HEADER: 42,
    TREE_SINGLE_NODE: 32,
    TREE_GROUP_NODE: 32,
    MISSING_FIELD: 32,
    EMPTY_STATE: 60,
} as const;

// Base type for all flattened items
interface BaseFlattenedItem {
    id: string; // Unique identifier for React key
    estimatedHeight: number; // For virtualizer sizing
}

// Table header item (shown when multiple tables exist)
export interface TableHeaderItem extends BaseFlattenedItem {
    type: 'table-header';
    data: {
        table: CompiledTable;
        isExpanded: boolean;
    };
}

// Help button configuration for section headers
export interface SectionHelpButton {
    href: string;
    tooltipText: string; // Plain text for the tooltip
}

// Section header item (Dimensions, Metrics, etc.)
export interface SectionHeaderItem extends BaseFlattenedItem {
    type: 'section-header';
    data: {
        tableName: string;
        treeSection: TreeSection;
        label: string;
        color: string; // Mantine color like 'blue.9', 'yellow.9'
        depth?: number; // Depth for indentation when table headers are present
        helpButton?: SectionHelpButton;
    };
}

// Missing field alert item
export interface MissingFieldItem extends BaseFlattenedItem {
    type: 'missing-field';
    data: {
        fieldId: string;
        tableName: string;
        isDimension: boolean;
    };
}

// Shared context data for a section (dimensions, metrics, etc.)
// This avoids duplicating the same data across every node in the section
export interface SectionContext {
    tableName: string;
    sectionType: TreeSection;
    itemsMap: Record<string, NodeItem>;
    nodeMap: NodeMap; // Pre-computed node hierarchy
    missingCustomMetrics?: AdditionalMetric[];
    missingCustomDimensions?: CustomDimension[];
    itemsAlerts?: {
        [id: string]: {
            errors?: { message: string }[];
            warnings?: { message: string }[];
            infos?: { message: string }[];
        };
    };
    orderFieldsBy?: OrderFieldsByStrategy;
    isGithubIntegrationEnabled?: boolean;
    gitIntegration?: GitIntegrationConfiguration;
    searchQuery?: string;
    searchResults: string[];
}

// Tree node item (can be single node or group node)
// Only stores node-specific data, references shared section context
export interface TreeNodeItem extends BaseFlattenedItem {
    type: 'tree-node';
    data: {
        node: Node;
        isGroup: boolean;
        isExpanded?: boolean; // Only for group nodes
        sectionKey: string; // Reference to SectionContext in the contexts map
        depth: number; // Nesting level for indentation (0 = root level)
    };
}

// Empty state item (e.g., "No dimensions defined")
export interface EmptyStateItem extends BaseFlattenedItem {
    type: 'empty-state';
    data: {
        tableName: string;
        treeSection: 'dimensions' | 'metrics';
        message: string;
    };
}

// Union type for all flattened items
export type FlattenedItem =
    | TableHeaderItem
    | SectionHeaderItem
    | MissingFieldItem
    | TreeNodeItem
    | EmptyStateItem;

// Return type from flattenTree that includes both items and shared contexts
export interface FlattenedTreeData {
    items: FlattenedItem[];
    sectionContexts: Map<string, SectionContext>;
}

// Options for flattening the tree
export interface FlattenTreeOptions {
    // Table data
    tables: CompiledTable[];
    showMultipleTables: boolean; // Whether to show table headers

    // Expansion state
    expandedTables: Set<string>;
    expandedGroups: Set<string>;

    // Search
    searchQuery?: string;
    searchResultsMap: Record<string, string[]>; // table name -> search result keys
    isSearching: boolean;

    // Additional data
    additionalMetrics: AdditionalMetric[];
    customDimensions?: CustomDimension[];
    missingCustomMetrics: AdditionalMetric[];
    missingCustomDimensions: CustomDimension[];
    missingFieldIds: string[];

    // Selected fields (for determining if missing field is dimension or metric)
    selectedDimensions: string[];

    // Active fields (for pinning selected items to top)
    activeFields: Set<string>;

    // Git integration
    isGithubIntegrationEnabled?: boolean;
    gitIntegration?: GitIntegrationConfiguration;

    // Pre-computed node maps (key: `${tableName}-${sectionType}`)
    sectionNodeMaps: Map<string, NodeMap>;
}

// Section info for organizing nodes
export interface SectionInfo {
    type: TreeSection;
    label: string;
    color: string;
    itemsMap: Record<
        string,
        Dimension | Metric | AdditionalMetric | CustomDimension
    >;
    missingItems?: (AdditionalMetric | CustomDimension)[];
    itemsAlerts?: SectionContext['itemsAlerts'];
    orderFieldsBy?: OrderFieldsByStrategy;
}
