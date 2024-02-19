import { SearchResult } from '@lightdash/common';

export type SearchItem = {
    type: 'space' | 'dashboard' | 'saved_chart' | 'table' | 'field' | 'page';
    typeLabel:
        | 'Space'
        | 'Dashboard'
        | 'Chart'
        | 'Table'
        | 'Joined table'
        | 'Dimension'
        | 'Metric'
        | 'Page';
    title: string;
    prefix?: string;
    description?: string;
    location: { pathname: string; search?: string };
    item?: SearchResult;
};
