import {
    type AdditionalMetric,
    type CustomDimension,
    type Dimension,
    type GitIntegrationConfiguration,
    type GroupType,
    type Metric,
    type OrderFieldsByStrategy,
} from '@lightdash/common';
import type { TreeSection } from '../Virtualization/types';

export type Node = {
    key: string;
    label: string;
    index: number;
    children?: NodeMap;
    description?: string;
};

export type GroupNode = Required<Node>;

export type NodeMap = Record<string, Node>;

export const isGroupNode = (node: Node): node is GroupNode =>
    'children' in node;

export type NodeItem = Dimension | Metric | AdditionalMetric | CustomDimension;

export type TreeProviderProps = {
    orderFieldsBy?: OrderFieldsByStrategy;
    searchQuery?: string;
    itemsMap: Record<string, NodeItem>;
    missingCustomMetrics?: AdditionalMetric[];
    itemsAlerts?: {
        [id: string]: {
            errors?: { message: string }[];
            warnings?: { message: string }[];
            infos?: { message: string }[];
        };
    };
    missingCustomDimensions?: CustomDimension[];
    groupDetails?: Record<string, GroupType>;
    isGithubIntegrationEnabled?: boolean; // For displaying the write back on custom metrics in TreeSingleNodeActions
    gitIntegration?: GitIntegrationConfiguration;
    onItemClick: (key: string, item: NodeItem) => void;
    searchResults: string[];
    tableName: string; // Table name for building group keys
    treeSectionType: TreeSection; // Section type for building group keys
    expandedGroups: Set<string>;
    onToggleGroup: (groupKey: string) => void;
};

export type TableTreeContext = TreeProviderProps & {
    nodeMap: NodeMap;
    isSearching: boolean;
    searchResults: string[];
    isVirtualized?: boolean; // Flag to prevent group nodes from rendering children inline
    depth?: number; // Nesting depth for indentation in virtualized mode
    groupKey?: string; // Pre-computed group key (for virtualized tree with parent paths)
};
