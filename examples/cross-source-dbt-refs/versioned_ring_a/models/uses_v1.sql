select * from {{ ref('versioned_ring_b', 'dim', version=1) }}
