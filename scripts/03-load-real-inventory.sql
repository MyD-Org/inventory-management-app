-- Script para cargar el inventario real de Avantec
-- Primero limpiamos los datos de ejemplo
DELETE FROM stock_movements;
DELETE FROM inventory;
DELETE FROM materials;
DELETE FROM suppliers;
DELETE FROM categories;

-- Insertar categorías reales
INSERT INTO categories (name, description) VALUES
('Placas', 'Placas de LEDs y circuitos'),
('Reguladores de corriente', 'Reguladores y drivers de corriente'),
('Estructuras', 'Estructuras de aluminio, tapas y bases'),
('Accesorios', 'Accesorios varios, grampas, prensacables'),
('Opticas', 'Ópticas y lentes para LEDs'),
('Darkoo', 'Componentes marca Darkoo'),
('Piscina', 'Componentes para luminarias de piscina'),
('Pegamentos', 'Adhesivos y selladores'),
('Arandelas', 'Arandelas de acero'),
('Vidrios', 'Vidrios para luminarias'),
('Insumos', 'Barras de aluminio y materiales'),
('Proyectores', 'Estructuras para proyectores'),
('Optics', 'Productos Optic terminados'),
('Sin Categoría', 'Materiales sin categoría asignada');

-- Insertar proveedor por defecto
INSERT INTO suppliers (name, contact_person, email, phone) VALUES
('Proveedor General', 'Contacto', 'contacto@proveedor.com', '000-000-0000'),
('ARGENSOL', 'Contacto Argensol', 'contacto@argensol.com', '000-000-0001');

-- Insertar materiales reales del inventario
INSERT INTO materials (name, barcode, description, category_id, supplier_id, unit_of_measure, unit_cost, min_stock, max_stock) VALUES
-- Placas
('Placa 1 led bc 2200k', '33339153', '', (SELECT id FROM categories WHERE name = 'Placas'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 1.25, 0, 0),
('Placa 1 lec bc 3000k 25mm', '33334851', '', (SELECT id FROM categories WHERE name = 'Placas'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 1.25, 0, 0),
('Placa 1 led ambar', '11111160', '', (SELECT id FROM categories WHERE name = 'Placas'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 2.97, 0, 0),
('Placa 3 led bc 3000k 56mm', '11111122', '', (SELECT id FROM categories WHERE name = 'Placas'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 0.52, 0, 0),
('Placa 4 led bc 3000k c/reg', '33334721', '', (SELECT id FROM categories WHERE name = 'Placas'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 5.97, 0, 0),
('Placa 3 led bc 2200k', '33337326', '', (SELECT id FROM categories WHERE name = 'Placas'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 3.5, 0, 0),
('Placa 4 led verde nuevo', '33337401', '', (SELECT id FROM categories WHERE name = 'Placas'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 6.4, 0, 0),
('Placa 4 led bc 2200k', '33337128', '', (SELECT id FROM categories WHERE name = 'Placas'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 3.5, 0, 0),
('Placa 4 led bc 3000k', '11111245', '', (SELECT id FROM categories WHERE name = 'Placas'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 3.5, 0, 0),
('Placa 3 led bc 2200k 45mm', '33337319', '', (SELECT id FROM categories WHERE name = 'Placas'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 3.4, 0, 0),
('Placa optic 3 ambar', '11111108', '', (SELECT id FROM categories WHERE name = 'Placas'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 3.5, 0, 0),

-- Reguladores de corriente
('Placa electronica 21mm', '33336664', '', (SELECT id FROM categories WHERE name = 'Reguladores de corriente'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 3.6, 0, 0),
('Regulador de corriente rectangular de 7 a 30v', '33337774', '', (SELECT id FROM categories WHERE name = 'Reguladores de corriente'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 0.13, 0, 0),
('Regulador 12v corriente constante', '33332956', '', (SELECT id FROM categories WHERE name = 'Reguladores de corriente'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),

-- Estructuras
('Derlin 12cm', '33332604', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 3, 0, 0),
('Estaca aluminio negra', '33332598', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 1.1, 0, 0),
('Estaca aluminio 22cm', '33337210', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 1, 0, 0),
('Estructura optic 3 aluminio 63mm', '33337913', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 7.58, 0, 0),
('Estructura optic 3 63mm para optica 4', '33339771', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 7.58, 0, 0),
('Vidrio para embutido de piso 3 led', '33332659', '67mm x 5mm espesor', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 2.3, 0, 0),
('Vidrio para piscina 3 led', '33338286', '75mm x 5mm espesor', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 2.44, 0, 0),
('Vidrio para piscina 4 led', '33338279', '120mm x 5mm', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 2.5, 0, 0),
('Estructura optic 1 exterior con rosca', '33338651', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 0.01, 0, 0),
('Embutido para Luminaria de jardin', '33332703', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 0, 0, 0),
('Base piscina chico 3 LED', '33337821', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 0, 0, 0),
('Tapa piscina chico 3 led', '33337845', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 0, 0, 0),
('Base piscina grande', '33337814', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 4.02, 0, 0),
('Estructura optic 1 negro', '33332505', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 0.26, 0, 0),
('Base para optic de jardin', '33332765', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 0, 0, 0),
('Base para optic de jardin negro', '33332772', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 0, 0, 0),
('Grampa optic 1 corta', '33337470', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 0.18, 0, 0),
('Grampa optic 3 corta', '33337524', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 0.25, 0, 0),
('Grampa optic 1 larga', '33337531', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 0.23, 0, 0),
('Grampa optic 3 larga', '33337517', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 0.31, 0, 0),
('Grampa optic 4 corta', '33337494', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 0.34, 0, 0),
('Grampa optic 4 larga', '33337500', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 0.72, 0, 0),
('Caño 80cm 9,52mm diam optic jardin con movimiento negro', '33332734', 'tiene el precio del movimiento incluido, mov U$S5, caño U$S 3.28', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 0, 0, 0),
('Estructura para embutido de piso 3 led', '33332789', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 7.58, 0, 0),
('Tapa optic 3', '33339658', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 1.02, 0, 0),
('Tapa optic 3 c/acrilico', '33339184', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 0, 0, 0),
('Tapa optic 3 negro', '33332536', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 1.02, 0, 0),
('Estructura Unidireccional 2 led 63mm negro', '33332796', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 7.45, 0, 0),
('Caño luminaria de jardin 42cm de 32mm', '33332727', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 5.23, 164, 0),
('Tapa optic 1 negro', '33332512', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 0.14, 0, 0),
('Tapa optic 1', '33338668', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 0.01, 0, 0),
('Tapa optic 1 c/acrilico', '33332574', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 0, 0, 0),
('Tapa optic 1 negro c/acrilico', '33332581', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 0, 0, 0),
('Aros para embutido de piso 3 led', '33332550', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 0, 0, 0),
('Tortita aluminio para piscina chica', '33332567', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 0, 0, 0),
('Estructura optic de jardin tornasolado', '33336121', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 0, 0, 0),
('Tapa optic 1 tornasolado', '33332635', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 0.41, 0, 0),
('Estructura optic 4 para RGBW', '33332819', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Tapa optic 3 negra c/acrilico', '33332833', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Tapa c/1 agujero para optic 4 SG', '33333069SG', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0.65, 0, 0),
('Tapa para optic 4 SG', '33333052SG', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0.65, 0, 0),
('Tapas ciegas Optic 4', '33333052', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Tapas c/1 agujero Optic 4', '33333069', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Tapas c/2 agujeros Optic 4', '33333076', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Juego movimiento mariposa para optic de jardin', '33332710', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 5, 0, 0),
('Tuerca de aluminio 1/2', '33337876', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Estructura optic 4 negro', '33333106', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Caño luminaria de jardin 12cm de 32mm', '33332758', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Caño luminaria de jardin 18cm negro', '33332741', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Tapa unidireccional 2 led 63mm', '33333113', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Cuerpo bidireccional con boca de pez 32mm', '33333120', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Estructura bidireccional acero 32mm', '33333137', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Caño para boca de pez unidireccional/bidireccional 32mm', '33333144', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Cuerpo bidireccional 32mm', '33333151', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Base para optic jardin de pared', '33333175', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 3.5, 0, 0),
('Tortita unidireccional/bidireccional 32mm', '33333182', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Tapa optic 1 para optic de embutir', '33333458', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Tapa optic 1 para optic de embutir c/ acrilico', '33333465', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Estructura unidireccional 63mm acero', '33333472', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Estructura unidireccional 63mm blanco', '33333489', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Estructura unidireccional 63mm avanzado blanco', '33333496', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Estructura unidireccional 63mm avanzado negro', '33333519', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Estructura bidireccional 63mm blanco', '33333502', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Barra aluminio 32mm 3mts', '33337579', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Barra aluminio 32mm 1.11mts', '33337189', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Barra aluminio 32mm 0.39mts', '33334196', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Barra aluminio 25mm', '33337586', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Estructura embutido de piso 3 led largo 58mm', '33334110', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Estructura optic 1 interior 32mm', '33334332', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Aros de aluminio 1 led', '33334363', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Tortita de aluminio para piscina grande', '33334431', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Unidireccional 1 led negro 32mm', '33334530', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Tortita aluminio unidireccional y bidireccional 63mm', '33334561', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Estructura cuerpo step light especial', '44440015', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 13, 0, 0),
('Caño luminaria de jardin 18cm acero', '44440046', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Barra aluminio 32mm 2.10mts', '33334165', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Barra aluminio 32mm 2.28mts', '33334172', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Barra aluminio 25mm 3mts', '33337586B', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Barra aluminio 25mm 0.75mts', '33334233', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Barra aluminio 32mm 1.26mts', '33334394', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Barra aluminio 32mm 1.745mts', '33334400', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Barra aluminio 32mm 1.5mts', '33334417', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Estructura Optic 3 63mm c/rosca avanzados 24V', '33339856', '', (SELECT id FROM categories WHERE name = 'Estructuras'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),

-- Accesorios
('Goma de prensacable', '33337852', '', (SELECT id FROM categories WHERE name = 'Accesorios'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 0, 0, 0),
('Prensacable optic 1 PG7', '22223388', '8101N', (SELECT id FROM categories WHERE name = 'Accesorios'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Tuerca bronce 1/2', '33337877', '', (SELECT id FROM categories WHERE name = 'Accesorios'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Tapa para prensacable bronce', '33337884', '', (SELECT id FROM categories WHERE name = 'Accesorios'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Cuerpo prensacable bronce', '33332802', '', (SELECT id FROM categories WHERE name = 'Accesorios'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Vidrio 30x6,7cm x6mm SG', '33338262', '', (SELECT id FROM categories WHERE name = 'Accesorios'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 3.5, 0, 0),
('Vidrio 100x67x6mm SG', '33338255', '', (SELECT id FROM categories WHERE name = 'Accesorios'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 3.5, 0, 0),
('Grampa optic 4 corta negra', '33333403', '', (SELECT id FROM categories WHERE name = 'Accesorios'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Grampa optic 1 larga negra', '33333410', '', (SELECT id FROM categories WHERE name = 'Accesorios'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Grampa optic 1 corta negra', '33333434', '', (SELECT id FROM categories WHERE name = 'Accesorios'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Grampa optic 3 corta negra', '33333427', '', (SELECT id FROM categories WHERE name = 'Accesorios'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Grampa optic 1 larga blanca', '33333441', '', (SELECT id FROM categories WHERE name = 'Accesorios'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Movimiento para optic de jardin con optic 1', '33334424', '', (SELECT id FROM categories WHERE name = 'Accesorios'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Juego movimiento mariposa para optic de jardin negro', '33334349', '', (SELECT id FROM categories WHERE name = 'Accesorios'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),

-- Opticas
('Optica individual 8 Darkoo', '33338637', 'dk-20-08-lends-h14', (SELECT id FROM categories WHERE name = 'Opticas'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0.16, 0, 0),
('Optica individual 25 Darkoo', '33338644', '', (SELECT id FROM categories WHERE name = 'Opticas'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0.16, 0, 0),
('Optica individual 45 Darkoo', '33338620', '', (SELECT id FROM categories WHERE name = 'Opticas'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0.16, 0, 0),
('Optica 2x2 30 Darkoo', '33338613', '', (SELECT id FROM categories WHERE name = 'Opticas'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0.15, 0, 0),
('Optica 2x2 25 Ledil', '33336879', '', (SELECT id FROM categories WHERE name = 'Opticas'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Optica individual 25 Darkoo SG', '33338644SG', '', (SELECT id FROM categories WHERE name = 'Opticas'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0.16, 0, 0),

-- Darkoo
('Encapsulado blanco para optica 4 darkoo', '33338392', '', (SELECT id FROM categories WHERE name = 'Darkoo'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0.1, 0, 0),
('Optica 4 darkoo', '33338446', '', (SELECT id FROM categories WHERE name = 'Darkoo'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0.85, 0, 0),

-- Piscina
('Tapa piscina grande', '33337838', '', (SELECT id FROM categories WHERE name = 'Piscina'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),

-- Pegamentos
('Adhesivo silicone material ST-1200 SG', '33332970', '', (SELECT id FROM categories WHERE name = 'Pegamentos'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 1.05, 0, 0),
('Terostat negro', '33334660', '', (SELECT id FROM categories WHERE name = 'Pegamentos'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 18705.88, 0, 0),
('Terostat blanco SG', '33336671', '', (SELECT id FROM categories WHERE name = 'Pegamentos'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 14400, 0, 0),

-- Arandelas
('Arandela acero embutido 1 led 55/30.84', '33332994', '', (SELECT id FROM categories WHERE name = 'Arandelas'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Arandela acero para embutido 1 led recedido 55/28.6', '33332987', '', (SELECT id FROM categories WHERE name = 'Arandelas'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Arandela acero embutido 1 led c/vidrio 70/35.5', '33333014', '', (SELECT id FROM categories WHERE name = 'Arandelas'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Arandela acero embutido 3 led 140/67.5', '33333007', '', (SELECT id FROM categories WHERE name = 'Arandelas'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Base acero unidirecciona y doble rayo 64mm', '33333021', '', (SELECT id FROM categories WHERE name = 'Arandelas'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0.89, 0, 0),

-- Vidrios
('Vidrio embutido 3 led viejo 61.5x6mm', '33333038', '', (SELECT id FROM categories WHERE name = 'Vidrios'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Vidrio embutido 3 led viejo 61.5x5mm', '33333045', '', (SELECT id FROM categories WHERE name = 'Vidrios'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Vidrio redondo 35.2', '33334158', '', (SELECT id FROM categories WHERE name = 'Vidrios'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0.96, 0, 0),

-- Insumos
('Barra aluminio 64mm 119.1 cm', '33333274', '', (SELECT id FROM categories WHERE name = 'Insumos'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Barra aluminio 64mm 134.4 cm', '33333281', '', (SELECT id FROM categories WHERE name = 'Insumos'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Barra aluminio 64mm 1.369mts', '33333298', '', (SELECT id FROM categories WHERE name = 'Insumos'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Barra aluminio 64mm 1.399mts', '33333304', '', (SELECT id FROM categories WHERE name = 'Insumos'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Barra aluminio 64mm 148 cm', '33333311', '', (SELECT id FROM categories WHERE name = 'Insumos'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Barra aluminio 64mm 148.9 cm', '33333328', '', (SELECT id FROM categories WHERE name = 'Insumos'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Barra aluminio 64mm 1.50mts', '33333335', '', (SELECT id FROM categories WHERE name = 'Insumos'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Barra aluminio 64mm 150.1 cm', '33333342', '', (SELECT id FROM categories WHERE name = 'Insumos'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Barra aluminio 64mm 150.3 cm', '33333359', '', (SELECT id FROM categories WHERE name = 'Insumos'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Barra aluminio 64mm 165.8 cm', '33333366', '', (SELECT id FROM categories WHERE name = 'Insumos'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Barra aluminio 64mm 111.9 cm', '33333373', '', (SELECT id FROM categories WHERE name = 'Insumos'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),

-- Proyectores
('Estructura proyector 30cm', '33334134', '', (SELECT id FROM categories WHERE name = 'Proyectores'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Estructura proyector 30cm color bronce', '33334141', '', (SELECT id FROM categories WHERE name = 'Proyectores'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),

-- Optics (productos)
('Optic 3 24V bc 2200k 30 sin acrilico', '33333083', '', (SELECT id FROM categories WHERE name = 'Optics'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Optic 3 24V bc 2500k 30 sin acrilico', '33333090', '', (SELECT id FROM categories WHERE name = 'Optics'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Optic 3 24v bc 2200k 30 sin tapa', '33334622', '', (SELECT id FROM categories WHERE name = 'Optics'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Optic 3 24v bc 2200k para embutido', '33334646', '', (SELECT id FROM categories WHERE name = 'Optics'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Optic 3 24v bc 3000k sin tapa', '33334639', '', (SELECT id FROM categories WHERE name = 'Optics'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),

-- Sin categoría
('Orin para optic 3', '33337654', 'as034-53.7mm diam -proveedor ARGENSOL', (SELECT id FROM categories WHERE name = 'Sin Categoría'), (SELECT id FROM suppliers WHERE name = 'ARGENSOL'), 'Pieza', 0.07, 0, 0),
('Orin para optic 1', '33339818', '', (SELECT id FROM categories WHERE name = 'Sin Categoría'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 0.05, 0, 0),
('Estructura optic 3 negro', '33332529', '', (SELECT id FROM categories WHERE name = 'Sin Categoría'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 7.58, 0, 0),
('Estructura Optic de jardin negro', '33332611', '', (SELECT id FROM categories WHERE name = 'Sin Categoría'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Pieza', 2.37, 0, 0),
('Acrilico para embutido 3 led especial y optic 3 viejos', '33334127', '', (SELECT id FROM categories WHERE name = 'Sin Categoría'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Barra aluminio 32mm 0.25mts', '33334202', '', (SELECT id FROM categories WHERE name = 'Sin Categoría'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Barra aluminio 25mm 1.25mts', '33334240', '', (SELECT id FROM categories WHERE name = 'Sin Categoría'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Barra de aluminio 32mm 0.52mts', '33334257', '30°', (SELECT id FROM categories WHERE name = 'Sin Categoría'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0),
('Base bidirecciona especial 12x12', '33334547', '', (SELECT id FROM categories WHERE name = 'Sin Categoría'), (SELECT id FROM suppliers WHERE name = 'Proveedor General'), 'Unidad', 0, 0, 0);

-- Ahora insertamos el inventario con las cantidades actuales
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 0 FROM materials WHERE barcode = '33339153';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 107 FROM materials WHERE barcode = '33337654';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 14 FROM materials WHERE barcode = '33334851';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 2 FROM materials WHERE barcode = '11111160';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 0 FROM materials WHERE barcode = '11111122';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 0 FROM materials WHERE barcode = '33334721';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 0 FROM materials WHERE barcode = '33337326';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 0 FROM materials WHERE barcode = '33337401';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 0 FROM materials WHERE barcode = '33337128';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 4 FROM materials WHERE barcode = '11111245';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 0 FROM materials WHERE barcode = '33337319';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 10 FROM materials WHERE barcode = '33336664';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 317 FROM materials WHERE barcode = '33337774';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 2 FROM materials WHERE barcode = '33332604';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 200 FROM materials WHERE barcode = '33332598';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 388 FROM materials WHERE barcode = '33337210';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 94 FROM materials WHERE barcode = '33337913';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 28 FROM materials WHERE barcode = '33339771';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 167 FROM materials WHERE barcode = '33339818';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 120 FROM materials WHERE barcode = '33332659';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 57 FROM materials WHERE barcode = '33338286';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 76 FROM materials WHERE barcode = '33338279';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 198 FROM materials WHERE barcode = '33338651';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 47 FROM materials WHERE barcode = '33332703';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 16 FROM materials WHERE barcode = '33337821';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 20 FROM materials WHERE barcode = '33337845';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 9 FROM materials WHERE barcode = '33337814';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 172 FROM materials WHERE barcode = '33332505';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 42 FROM materials WHERE barcode = '33332529';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 16 FROM materials WHERE barcode = '33332611';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 163 FROM materials WHERE barcode = '33332765';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 85 FROM materials WHERE barcode = '33332772';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 2207 FROM materials WHERE barcode = '33337470';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 1795 FROM materials WHERE barcode = '33337524';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 1112 FROM materials WHERE barcode = '33337531';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 103 FROM materials WHERE barcode = '33337517';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 40 FROM materials WHERE barcode = '33337494';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 22 FROM materials WHERE barcode = '33337500';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 75 FROM materials WHERE barcode = '33332734';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 9 FROM materials WHERE barcode = '33332789';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 103 FROM materials WHERE barcode = '33339658';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 9 FROM materials WHERE barcode = '33339184';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 23 FROM materials WHERE barcode = '33332536';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 3 FROM materials WHERE barcode = '33332796';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 19 FROM materials WHERE barcode = '33332727';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 147 FROM materials WHERE barcode = '33332512';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 280 FROM materials WHERE barcode = '33338668';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 0 FROM materials WHERE barcode = '33332574';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 4 FROM materials WHERE barcode = '33332581';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 1 FROM materials WHERE barcode = '33337852';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 3 FROM materials WHERE barcode = '33338637';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 24 FROM materials WHERE barcode = '33338644';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 0 FROM materials WHERE barcode = '33338620';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 0 FROM materials WHERE barcode = '33336121';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 6 FROM materials WHERE barcode = '33332635';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 0 FROM materials WHERE barcode = '33338613';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 0 FROM materials WHERE barcode = '33336879';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 350 FROM materials WHERE barcode = '22223388';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 405 FROM materials WHERE barcode = '33332550';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 529 FROM materials WHERE barcode = '33332567';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 84 FROM materials WHERE barcode = '33337877';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 26 FROM materials WHERE barcode = '33337884';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 38 FROM materials WHERE barcode = '33332802';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 1 FROM materials WHERE barcode = '11111108';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 8 FROM materials WHERE barcode = '33337838';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 448 FROM materials WHERE barcode = '33338644SG';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 13 FROM materials WHERE barcode = '33332819';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 0 FROM materials WHERE barcode = '33338392';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 0 FROM materials WHERE barcode = '33338446';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 3 FROM materials WHERE barcode = '33332833';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 5 FROM materials WHERE barcode = '33332956';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 6 FROM materials WHERE barcode = '33338262';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 5 FROM materials WHERE barcode = '33338255';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 14 FROM materials WHERE barcode = '33332970';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 22 FROM materials WHERE barcode = '33334660';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 8 FROM materials WHERE barcode = '33336671';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 12 FROM materials WHERE barcode = '33332994';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 70 FROM materials WHERE barcode = '33332987';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 6 FROM materials WHERE barcode = '33333014';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 140 FROM materials WHERE barcode = '33333007';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 9 FROM materials WHERE barcode = '33333021';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 6 FROM materials WHERE barcode = '33333038';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 8 FROM materials WHERE barcode = '33333045';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 143 FROM materials WHERE barcode = '33333052';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 43 FROM materials WHERE barcode = '33333069';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 1 FROM materials WHERE barcode = '33333076';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 14 FROM materials WHERE barcode = '33333083';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 1 FROM materials WHERE barcode = '33333090';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 0 FROM materials WHERE barcode = '33339856';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 93 FROM materials WHERE barcode = '33332710';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 68 FROM materials WHERE barcode = '33337876';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 2 FROM materials WHERE barcode = '33333106';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 0 FROM materials WHERE barcode = '33332758';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 4 FROM materials WHERE barcode = '33332741';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 27 FROM materials WHERE barcode = '33333113';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 34 FROM materials WHERE barcode = '33333120';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 6 FROM materials WHERE barcode = '33333137';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 17 FROM materials WHERE barcode = '33333144';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 33 FROM materials WHERE barcode = '33333151';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 6 FROM materials WHERE barcode = '33333175';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 10 FROM materials WHERE barcode = '33333182';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 0 FROM materials WHERE barcode = '33333274';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 0 FROM materials WHERE barcode = '33333281';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 3 FROM materials WHERE barcode = '33333298';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 3 FROM materials WHERE barcode = '33333304';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 0 FROM materials WHERE barcode = '33333311';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 0 FROM materials WHERE barcode = '33333328';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 0 FROM materials WHERE barcode = '33333335';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 0 FROM materials WHERE barcode = '33333342';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 11 FROM materials WHERE barcode = '33333359';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 0 FROM materials WHERE barcode = '33333366';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 0 FROM materials WHERE barcode = '33333373';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 3 FROM materials WHERE barcode = '33333403';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 5 FROM materials WHERE barcode = '33333410';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 12 FROM materials WHERE barcode = '33333434';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 15 FROM materials WHERE barcode = '33333427';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 1 FROM materials WHERE barcode = '33333441';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 537 FROM materials WHERE barcode = '33333069SG';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 457 FROM materials WHERE barcode = '33333052SG';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 63 FROM materials WHERE barcode = '33333458';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 55 FROM materials WHERE barcode = '33333465';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 5 FROM materials WHERE barcode = '33333472';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 1 FROM materials WHERE barcode = '33333489';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 1 FROM materials WHERE barcode = '33333496';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 0 FROM materials WHERE barcode = '33333519';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 1 FROM materials WHERE barcode = '33333502';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 15 FROM materials WHERE barcode = '33337579';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 1 FROM materials WHERE barcode = '33337189';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 4 FROM materials WHERE barcode = '33334196';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 0 FROM materials WHERE barcode = '33337586';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 0 FROM materials WHERE barcode = '33334110';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 21 FROM materials WHERE barcode = '33334134';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 5 FROM materials WHERE barcode = '33334141';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 16 FROM materials WHERE barcode = '33334158';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 1 FROM materials WHERE barcode = '33334165';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 1 FROM materials WHERE barcode = '33334172';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 357 FROM materials WHERE barcode = '33334127';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 1 FROM materials WHERE barcode = '33334202';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 49 FROM materials WHERE barcode = '33337586B';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 1 FROM materials WHERE barcode = '33334233';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 1 FROM materials WHERE barcode = '33334240';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 6 FROM materials WHERE barcode = '33334257';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 32 FROM materials WHERE barcode = '33334394';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 25 FROM materials WHERE barcode = '33334400';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 7 FROM materials WHERE barcode = '33334417';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 53 FROM materials WHERE barcode = '33334332';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 17 FROM materials WHERE barcode = '33334363';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 29 FROM materials WHERE barcode = '33334424';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 9 FROM materials WHERE barcode = '33334431';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 5 FROM materials WHERE barcode = '33334349';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 1 FROM materials WHERE barcode = '33334530';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 2 FROM materials WHERE barcode = '33334547';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 0 FROM materials WHERE barcode = '33334622';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 47 FROM materials WHERE barcode = '33334561';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 1 FROM materials WHERE barcode = '33334646';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 1 FROM materials WHERE barcode = '33334639';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 52 FROM materials WHERE barcode = '44440015';
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 11 FROM materials WHERE barcode = '44440046';
