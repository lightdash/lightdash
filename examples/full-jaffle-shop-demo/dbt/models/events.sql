SELECT *, 'https://placehold.co/300x100?text=id%20' || event as image_url  FROM {{ ref('raw_events') }}
