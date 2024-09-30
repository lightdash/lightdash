import { type SearchResultMap } from '../types/searchResultMap';

export const isSearchResultEmpty = (searchResult: SearchResultMap) => {
    return Object.values(searchResult).every((value) => value.length === 0);
};
