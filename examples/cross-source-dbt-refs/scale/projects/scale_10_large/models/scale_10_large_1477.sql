select b.id::integer as id, 'scale_10_large'::text as label,
       (295)::numeric as amount, (b.id % 2 = 0) as active,
       (date '2026-01-01' + b.id) as event_date
from generate_series(1, 12) as b(id)
