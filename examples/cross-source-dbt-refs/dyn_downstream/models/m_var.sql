select * from {{ ref(var('upstream_project'), 'dim_a') }}
