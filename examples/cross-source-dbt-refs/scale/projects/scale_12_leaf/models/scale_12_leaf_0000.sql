select b.id::integer as id, 'scale_12_leaf'::text as label,
       (103)::numeric as amount, (b.id % 2 = 0) as active,
       (date '2026-01-01' + b.id) as event_date
from generate_series(1, 8) as b(id)
