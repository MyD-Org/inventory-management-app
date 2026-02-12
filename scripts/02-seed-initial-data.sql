-- Insertar datos iniciales para el sistema de inventario

-- Categorías de materiales para componentes de iluminación
INSERT INTO categories (name, description) VALUES
('Cables y Conductores', 'Cables eléctricos, conductores y alambres'),
('Componentes Electrónicos', 'LEDs, resistencias, capacitores, transformadores'),
('Estructuras y Soportes', 'Perfiles de aluminio, soportes, bases'),
('Óptica', 'Lentes, reflectores, difusores'),
('Conectores', 'Conectores eléctricos, terminales, bornes'),
('Materiales de Montaje', 'Tornillos, tuercas, adhesivos, cintas')
ON CONFLICT (name) DO NOTHING;

-- Proveedores ejemplo
INSERT INTO suppliers (name, contact_person, email, phone, address) VALUES
('Distribuidora Eléctrica SA', 'Juan Pérez', 'juan@distribuidora.com', '+54-11-1234-5678', 'Av. Industrial 123, CABA'),
('LED Components SRL', 'María García', 'maria@ledcomponents.com', '+54-11-8765-4321', 'Parque Industrial Norte, Zona 2'),
('Aluminio y Perfiles', 'Carlos López', 'carlos@aluperfiles.com', '+54-11-5555-0000', 'Ruta 8 Km 45, Pilar')
ON CONFLICT DO NOTHING;

-- Materiales ejemplo con códigos de barras
INSERT INTO materials (barcode, name, description, category_id, supplier_id, unit_of_measure, min_stock, max_stock, unit_cost) VALUES
('7891234567890', 'Cable AWG 18 Rojo', 'Cable eléctrico AWG 18 color rojo', 1, 1, 'metros', 100, 1000, 2.50),
('7891234567891', 'Cable AWG 18 Negro', 'Cable eléctrico AWG 18 color negro', 1, 1, 'metros', 100, 1000, 2.50),
('7891234567892', 'LED 5050 Blanco Frío', 'LED SMD 5050 6500K blanco frío', 2, 2, 'unidad', 500, 5000, 0.15),
('7891234567893', 'LED 5050 Blanco Cálido', 'LED SMD 5050 3000K blanco cálido', 2, 2, 'unidad', 500, 5000, 0.15),
('7891234567894', 'Perfil Aluminio 2m', 'Perfil de aluminio para tira LED 2 metros', 3, 3, 'unidad', 50, 500, 12.00),
('7891234567895', 'Transformador 12V 5A', 'Fuente switching 12V 5A para LED', 2, 2, 'unidad', 20, 200, 25.00),
('7891234567896', 'Conector Rápido 2 Vías', 'Conector rápido para empalmes', 5, 1, 'unidad', 200, 2000, 0.50),
('7891234567897', 'Difusor Opal 2m', 'Difusor opal para perfil de aluminio', 4, 3, 'unidad', 50, 500, 8.00)
ON CONFLICT (barcode) DO NOTHING;

-- Inicializar inventario con stock inicial
INSERT INTO inventory (material_id, current_stock) 
SELECT id, 
    CASE 
        WHEN unit_of_measure = 'metros' THEN 500
        WHEN unit_of_measure = 'unidad' AND max_stock > 1000 THEN 2500
        WHEN unit_of_measure = 'unidad' THEN 100
        ELSE 50
    END
FROM materials
ON CONFLICT (material_id) DO NOTHING;

-- Crear algunos movimientos iniciales de ejemplo
INSERT INTO stock_movements (material_id, movement_type, quantity, previous_stock, new_stock, reference_number, notes, user_name)
SELECT 
    m.id,
    'entrada',
    i.current_stock,
    0,
    i.current_stock,
    'INIT-001',
    'Stock inicial del sistema',
    'Sistema'
FROM materials m
JOIN inventory i ON m.id = i.material_id;
