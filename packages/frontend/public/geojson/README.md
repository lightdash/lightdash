# GeoJSON Data Sources

## us-states.json

US state boundaries for area/choropleth maps.

**Source:** [PublicaMundi/MappingAPI](https://github.com/PublicaMundi/MappingAPI)

### Available Properties

| Property  | Description        | Example    |
| --------- | ------------------ | ---------- |
| `name`    | State name         | California |
| `density` | Population density | 241.7      |

---

## countries.geojson

World countries boundaries for area/choropleth maps.

**Source:** [datasets/geo-countries](https://github.com/datasets/geo-countries)

**Original Data:** [Natural Earth](https://www.naturalearthdata.com/) - public domain

**License:** [Open Data Commons Public Domain Dedication and License (PDDL)](https://opendatacommons.org/licenses/pddl/)

### Available Properties

Each country feature includes the following properties that can be used for matching:

| Property            | Description             | Example |
| ------------------- | ----------------------- | ------- |
| `name`              | Country name            | Italy   |
| `ISO3166-1-Alpha-2` | ISO 3166-1 alpha-2 code | IT      |
| `ISO3166-1-Alpha-3` | ISO 3166-1 alpha-3 code | ITA     |
