INSERT INTO products(barcode,name,brand,unit,category) VALUES
('8941100500011','Soybean Oil 2L','Fresh','2 L','Grocery'),
('8941100500012','Miniket Rice 5kg','Local Select','5 kg','Rice'),
('8941100500013','Pasteurized Milk 1L','Demo Dairy','1 L','Dairy')
ON CONFLICT (barcode) DO NOTHING;
INSERT INTO price_observations(product_id,shop_name,shop_area,price_bdt,source,observed_at)
SELECT id,'Agora','Dhanmondi',372,'demo',NOW()-INTERVAL '2 days' FROM products WHERE barcode='8941100500011';
INSERT INTO price_observations(product_id,shop_name,shop_area,price_bdt,source,observed_at)
SELECT id,'Shwapno','Uttara',368,'demo',NOW()-INTERVAL '1 day' FROM products WHERE barcode='8941100500011';
INSERT INTO price_observations(product_id,shop_name,shop_area,price_bdt,source,observed_at)
SELECT id,'Local Market','Mohammadpur',360,'demo',NOW()-INTERVAL '5 hours' FROM products WHERE barcode='8941100500011';
