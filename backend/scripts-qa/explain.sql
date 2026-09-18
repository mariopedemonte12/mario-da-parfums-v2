\set QUIET on
\echo === 1 token 6 chars (chanel: rare in name, common in brand)
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF) select * from fragrances where (name ilike '%chanel%' or brand ilike '%chanel%') order by id asc limit 20;
\echo === 1 token 4 chars rare (zzqx)
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF) select * from fragrances where (name ilike '%zzqx%' or brand ilike '%zzqx%') order by id asc limit 20;
\echo === 2 tokens dior sauvage
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF) select * from fragrances where (name ilike '%dior%' or brand ilike '%dior%') and (name ilike '%sauvage%' or brand ilike '%sauvage%') order by id asc limit 20;
\echo === 3 chars token common (bra)
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF) select * from fragrances where (name ilike '%bra%' or brand ilike '%bra%') order by id asc limit 20;
\echo === 3 chars rare token (qzx)
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF) select * from fragrances where (name ilike '%qzx%' or brand ilike '%qzx%') order by id asc limit 20;
\echo === 2 chars token rare (qz)
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF) select * from fragrances where (name ilike '%qz%' or brand ilike '%qz%') order by id asc limit 20;
\echo === 1 char token rare (q)
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF) select * from fragrances where (name ilike '%q%' or brand ilike '%q%') order by id asc limit 20;
\echo === 1 char token common (a)
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF) select * from fragrances where (name ilike '%a%' or brand ilike '%a%') order by id asc limit 20;
\echo === 5 tokens 1-char (a b c d q)
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF) select * from fragrances where (name ilike '%a%' or brand ilike '%a%') and (name ilike '%b%' or brand ilike '%b%') and (name ilike '%c%' or brand ilike '%c%') and (name ilike '%d%' or brand ilike '%d%') and (name ilike '%q%' or brand ilike '%q%') order by id asc limit 20;
\echo === noir + cursor
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF) select * from fragrances where (name ilike '%noir%' or brand ilike '%noir%') and id > '80000000-0000-4000-8000-000000000000' order by id asc limit 20;
\echo === rare + concentration filter
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF) select * from fragrances where (name ilike '%zzqx%' or brand ilike '%zzqx%') and concentration='EDP' order by id asc limit 20;
