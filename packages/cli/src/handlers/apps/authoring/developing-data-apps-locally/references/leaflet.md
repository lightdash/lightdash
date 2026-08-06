# Leaflet maps in locally developed data apps

> Read this when the app needs an interactive geographic or raster-tile map and Leaflet is available or the user has confirmed that custom dependencies are enabled.

Leaflet is not part of the standard data-app dependency set. Use it only when `package.json` already declares `leaflet`, or after the user confirms that their organization permits custom dependencies. Do not load Leaflet from a CDN or vendor its source into `src/`.

## 1. Add Leaflet only when custom dependencies are allowed

If Leaflet is missing, follow the parent skill's dependency workflow and update both dependency files:

```bash
sfw pnpm add leaflet@1.9.4
```

Use `pnpm add leaflet@1.9.4` when Socket Firewall is unavailable. Keep lifecycle scripts disabled. Do not hand-edit only `package.json`: upload requires the matching `pnpm-lock.yaml`.

## 2. Configure the public tile origin

Deployed data apps deny arbitrary browser images. A project admin must create a linked external connection that opts the tile server's exact HTTPS origin into the app's image policy.

In **Project settings → Data app connections**, create or edit a connection with:

- **Origin:** the exact tile origin, with no path—for example `https://a.tile.openstreetmap.org`.
- **Authentication:** `None`.
- **Allowed methods:** `GET`.
- **Allow public images in linked apps:** enabled.
- No credential or custom authorization header. Public browser images cannot use them.

The browser requests tiles directly. Connection path rules, custom headers, response limits, and rate limits do not apply to those image requests. Never enable this for private or credentialed tile servers, and never put Lightdash data or secrets in tile URLs.

The allowlist is exact-origin, not wildcard-based. Prefer a tile URL pinned to one hostname:

```ts
const TILE_URL = 'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png';
```

Do not use `https://{s}.tile.openstreetmap.org/...` unless every possible subdomain has its own linked, public-image-enabled connection. Otherwise some tiles work while others are blocked by CSP.

Link the existing connection in `lightdash-app.yml`, using its stable project slug:

```yaml
externalConnections:
    - alias: osm_tiles
      connectionSlug: openstreetmap-tiles
```

The alias is required for the app link even when the code only renders images and never calls `externalFetch`. If the connection does not exist in the target project or the uploader cannot manage connections, upload warns and skips the link; stop and report that instead of weakening the app.

For a code-managed connection, set the same policy in `lightdash/external-connections/<slug>.yml`: `authType: none`, `origin` equal to the exact HTTPS tile origin, `allowBrowserImages: true`, and `allowedMethods: [GET]`. Upload that connection before uploading the app, then reference its `slug` as `connectionSlug` in the app manifest.

## 3. Import Leaflet and its marker assets

Import the stylesheet and explicitly configure all default marker URLs at module scope, before creating a map:

```tsx
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIconUrl from 'leaflet/dist/images/marker-icon.png';
import markerIconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadowUrl from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({
    iconUrl: markerIconUrl,
    iconRetinaUrl: markerIconRetinaUrl,
    shadowUrl: markerShadowUrl,
});
```

This is required even though `leaflet.css` is imported. Vite may inline Leaflet's CSS marker image, which defeats Leaflet 1.9's legacy path detection; Leaflet then requests bare `marker-icon-2x.png` and `marker-shadow.png` paths from the app preview URL. Explicit imports let Vite bundle the small PNGs and avoid those 404s. These marker files are local library assets and do not need another external connection.

## 4. Mount and clean up the map in React

Give the container an explicit height and remove the map during effect cleanup. The template renders under React Strict Mode, so missing cleanup commonly causes `Map container is already initialized` during development.

```tsx
import { useEffect, useRef } from 'react';

export function Map() {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!containerRef.current) return undefined;

        const map = L.map(containerRef.current).setView([41.3874, 2.1686], 11);
        L.tileLayer(TILE_URL, {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19,
        }).addTo(map);
        L.marker([41.3874, 2.1686]).addTo(map);

        return () => map.remove();
    }, []);

    return <div ref={containerRef} className="h-[480px] w-full" />;
}
```

If the map starts inside a hidden tab, dialog, or resizable panel, call `map.invalidateSize()` after that container becomes visible or changes size. Always follow the tile provider's attribution, licensing, rate, and production-usage requirements.

## 5. Validate locally and after upload

1. Run `lightdash apps validate --build` to check the custom dependency and production bundle.
2. Run `lightdash apps preview`. Local preview resolves public image origins from the manifest's linked remote connections and applies them to its image CSP. This is narrower than `externalFetch`, which remains host-mediated and must be tested after upload.
3. In the browser network panel, confirm tile requests return successfully and there are no requests for bare `marker-icon.png`, `marker-icon-2x.png`, or `marker-shadow.png` paths.
4. Upload the app and verify the deployed preview, which is the authoritative CSP check.

| Symptom                                | Likely cause                                                                             | Fix                                                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Tile request blocked by `img-src`      | Connection is missing, unlinked, public images are disabled, or the URL's origin differs | Match the exact HTTPS origin, enable public images, link its slug, and restart local preview or upload a new version |
| Only some tiles load                   | A `{s}` URL rotates across origins                                                       | Pin the tile URL to one configured hostname, or configure and link every hostname                                    |
| Marker or shadow is broken             | Leaflet default image path detection failed after bundling                               | Import all three marker PNGs and call `L.Icon.Default.mergeOptions` at module scope                                  |
| Map area is blank or zero-height       | Leaflet CSS is missing or the container has no height                                    | Import `leaflet.css` and give the map container an explicit height                                                   |
| `Map container is already initialized` | React effect did not remove the previous map                                             | Return `map.remove()` from the effect                                                                                |
