# Adoption data app

This app comes from version 52 of Adoption. The files under `src/` are
overlaid onto the standard data app template by the normal source build.
Unused template files and uploaded images from the original are omitted.
The app uses the target Analytics project's semantic layer. Its feature
and recency fields are part of the `people_adoption` explore.

To ship an update, copy the updated source files here without any instance
context or uploaded images. Keep the manifest slug stable and use model
fields for queries. Changes to the bundle trigger a new version during
Analytics content sync. The app uses organization-wide rolling windows
and its own team selection.
