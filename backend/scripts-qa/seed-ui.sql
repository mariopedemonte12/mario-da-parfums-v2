-- QA: small UI dataset for the browser check (description = 'QA-UI')
DELETE FROM fragrances WHERE description = 'QA-UI';
INSERT INTO fragrances (name, brand, description, concentration, target_audience, longevity) VALUES
 ('Bleu de Chanel', 'Chanel', 'QA-UI', 'EDP', 'Men', 'Long'),
 ('Chanel No 5', 'Chanel', 'QA-UI', 'EDP', 'Women', 'Long'),
 ('Coco Mademoiselle', 'Chanel', 'QA-UI', 'EDT', 'Women', 'Moderate'),
 ('Le Male', 'Jean Paul Gaultier', 'QA-UI', 'EDT', 'Men', 'Long'),
 ('Ultra Male', 'Jean Paul Gaultier', 'QA-UI', 'EDT', 'Men', 'Long'),
 ('Sauvage', 'Dior', 'QA-UI', 'EDT', 'Men', 'Long'),
 ('Alpha Beta Gamma Delta Epsilon Zeta Eta Theta', 'Greek', 'QA-UI', 'EDP', 'Men', 'Long'),
 ('Une Tres Longue Fragrance Avec Beaucoup De Mots Dans Son Nom Complet Et Encore Plus De Mots Pour Depasser Cent Caracteres', 'LongBrand', 'QA-UI', 'EDP', 'Women', 'Long');
-- 45 filler perfumes under a Chanel-ish brand for pagination (load more) checks
INSERT INTO fragrances (name, brand, description, concentration)
SELECT 'Pagi Chanelesque ' || lpad(i::text, 2, '0'), 'Chanel Pagi House', 'QA-UI', 'EDT' FROM generate_series(0, 44) AS i;
