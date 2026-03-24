# F1 Dashboard — Build Plan

## Layout
- Dark F1-themed header with season title
- Tab navigation: Championship | Teams | Pit Stops

## Components & Data Sources

### KPI Cards (top of Championship tab)
- **Model:** `dim_driver_standings`
- **Fields (all dimensions):** `championship_position`, `driver_name`, `team`, `total_points`, `wins`, `races_entered`
- Query: all drivers, sorted by championship_position, limit 20

### Championship Progression (line chart — hero visual)
- **Model:** `fct_championship_progression`
- **Fields (all dimensions):** `round`, `driver_name`, `cumulative_points`, `race_name`
- Note: cumulative_points is a DIMENSION (pre-aggregated), NOT a metric
- Query: all rounds for all drivers, sorted by round asc

### Driver Standings (data table)
- **Model:** `dim_driver_standings`
- **Fields (all dimensions):** `championship_position`, `driver_name`, `team`, `total_points`, `wins`, `podiums`, `dnfs`, `avg_finish_position`, `avg_points_per_race`
- Query: sorted by championship_position asc

### Constructor Standings (horizontal bar chart)
- **Model:** `fct_constructor_standings`
- **Fields (all dimensions):** `constructor_name`, `championship_position`, `total_points`, `wins`, `podiums`
- Query: sorted by championship_position asc

### Teammate Battles (visual comparison bars)
- **Model:** `fct_teammate_battles`
- **Fields (all dimensions):** `constructor_name`, `driver_a`, `driver_b`, `race_wins_a`, `race_wins_b`, `quali_wins_a`, `quali_wins_b`, `total_races`

### Pit Stop Analysis (bar chart by team)
- **Model:** `fct_pit_stop_analysis`
- **Fields:** dimension `team` + metrics `avg_pit_stop_seconds`, `fastest_pit_stop_seconds`, `pit_stop_count`
- Query: grouped by team, sorted by avg_pit_stop_seconds asc
