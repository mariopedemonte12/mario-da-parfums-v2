\echo === two rare 3+ tokens (zzqx qzxz)
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY ON) select * from fragrances where (name ilike '%zzqx%' or brand ilike '%zzqx%') and (name ilike '%qzxz%' or brand ilike '%qzxz%') order by id asc limit 20;
\echo === rare 3+ token + common token (zzqx noir)
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY ON) select * from fragrances where (name ilike '%zzqx%' or brand ilike '%zzqx%') and (name ilike '%noir%' or brand ilike '%noir%') order by id asc limit 20;
\echo === selective real combo: bleu + 7 chars hash-ish (name has md5 fragment)
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY ON) select * from fragrances where (name ilike '%bleu%' or brand ilike '%bleu%') and (name ilike '%c4ca4238%' or brand ilike '%c4ca4238%') order by id asc limit 20;
\echo === dior + sauvage (both present, zero rows together)
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY ON) select * from fragrances where (name ilike '%dior%' or brand ilike '%dior%') and (name ilike '%sauvage%' or brand ilike '%sauvage%') order by id asc limit 20;
\echo === single common 3+ token with zero-results combination via filter
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY ON) select * from fragrances where (name ilike '%dior%' or brand ilike '%dior%') and concentration = 'Parfum' order by id asc limit 20;
