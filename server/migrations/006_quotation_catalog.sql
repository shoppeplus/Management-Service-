-- A legacy/default zero is not proof that an item is free.
ALTER TABLE inventory_skus ADD COLUMN price_known INTEGER NOT NULL DEFAULT 0 CHECK(price_known IN (0,1));
UPDATE inventory_skus SET price_known=1 WHERE price>0;
