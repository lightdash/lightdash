select nation_id, nation_name, region_id, date '2024-03-01' as joined_on
from {{ ref('trino_shared', 'trino_nations') }}
