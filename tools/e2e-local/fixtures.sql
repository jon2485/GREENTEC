-- Local test database only: data the staging DB has from the migration endpoints but the seed does not
-- (size/colour variations, an uploaded download file), so the variation and download-rights tests run.
UPDATE "Product" SET "variantsJson" = '{"groups":[{"id":901,"name":"מידה","options":[{"id":1,"label":"S"},{"id":2,"label":"M"}]}],"combos":{".1.":{"price":null,"qty":5},".2.":{"price":null,"qty":0}},"props":[]}', "hasVariants" = true
 WHERE id = (SELECT id FROM "Product" WHERE status = 1 AND "digitalPrice" IS NULL AND "bothPrice" IS NULL AND price > 0 AND quantity IS NULL AND "isSet" = false ORDER BY id DESC LIMIT 1) AND "variantsJson" = '';
UPDATE "Product" SET "digitalFile" = 'products/' || id || '/album.rar'
 WHERE id = (SELECT id FROM "Product" WHERE status = 1 AND "digitalPrice" > 0 AND "isSet" = false ORDER BY id DESC LIMIT 1) AND "digitalFile" = '';
