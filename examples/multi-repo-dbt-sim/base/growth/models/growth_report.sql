{% if var('sim_bootstrap', false) %}
select 1::integer as id, 'bootstrap'::text as label, 0::numeric as amount,
       true as active, date '2026-01-01' as event_date
{% else %}
select g.id, g.label, (g.amount + l.amount)::numeric as amount, g.active, g.event_date
from {{ ref('growth_base') }} g
join {{ ref('payments', 'ledger') }} l on g.id = l.id
{% endif %}
