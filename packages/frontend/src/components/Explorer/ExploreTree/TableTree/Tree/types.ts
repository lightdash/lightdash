import {
    type AdditionalMetric,
    type CustomDimension,
    type Dimension,
    type GroupType,
    type Metric,
    type OrderFieldsByStrategy,
} from '@lightdash/common';

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
    selectedItems: Set<string>;
    missingCustomMetrics?: AdditionalMetric[];
    missingCustomDimensions?: CustomDimension[];
    groupDetails?: Record<string, GroupType>;
    onItemClick: (key: string, item: NodeItem) => void;
};

export type TableTreeContext = TreeProviderProps & {
    nodeMap: NodeMap;
    isSearching: boolean;
    searchResults: Set<string>;
};
