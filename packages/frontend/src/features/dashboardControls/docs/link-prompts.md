# Link prompts

`LinkPrompts` offers to link a chart tile added while editing to filters
that could reach it through a field other than their target
(`getLinkCandidates`: one of the filter's other fields, else
`getFieldCandidates` of exactly the target's type).

- New tiles are derived: `newTileUuids` is tiles not in the saved dashboard.
  There is no snapshot state.
- No prompt for a tile with the target field (it links on its own), for SQL
  chart tiles, or for a SQL column filter.
- A row starts linked only on an exact match (`getLinkDefault`); everything
  else starts "Not filtered", so an unrelated field is never linked by
  default.
- Picks are derived per rule (`null` = cleared, absent = default); a pick no
  longer offered is dropped. Never synced in an effect.
- Linking is `setTileField`; skipping is `dismissLink`, kept in the provider
  until edit mode ends.
- Rendered only in edit mode with no filter edited, so it never stacks on
  `TileOverlays`.
