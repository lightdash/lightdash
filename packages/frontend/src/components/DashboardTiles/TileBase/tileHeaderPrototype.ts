// PROTOTYPE (throwaway): tile header action variants, switched with ?variant=
import { useSearchParams } from 'react-router';

export const TILE_HEADER_VARIANTS = [
    { key: 'current', name: 'Current (main)' },
    { key: 'inline', name: 'A: actions take room in the header' },
    { key: 'fade', name: 'B: actions fade over the title end' },
    { key: 'menu', name: 'C: one always-visible menu' },
] as const;

export type TileHeaderVariant = (typeof TILE_HEADER_VARIANTS)[number]['key'];

export const useTileHeaderVariant = (): TileHeaderVariant => {
    const [searchParams] = useSearchParams();
    const value = searchParams.get('variant');
    return TILE_HEADER_VARIANTS.find((v) => v.key === value)?.key ?? 'current';
};
