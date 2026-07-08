-- Módulo de presupuestación: productos/proyectos compuestos por materiales del
-- inventario + mano de obra + otros costos, con margen de ganancia.
-- Los costos por línea son SNAPSHOT al momento de guardar (el editor permite
-- "actualizar precios" para traer los vigentes de materials.unit_cost / employees.hourly_rate).

-- Empleados (para costo de mano de obra)
CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Presupuestos (producto o proyecto a fabricar)
CREATE TABLE IF NOT EXISTS budgets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'final')),
    margin_pct DECIMAL(5,2) NOT NULL DEFAULT 30.00, -- % de ganancia sobre el costo
    created_by VARCHAR(100), -- usuario de la sesión que lo creó
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Líneas de materiales del presupuesto. material_id nullable: permite líneas manuales
-- (materiales que no están en el inventario, p.ej. propuestos por la IA sin match).
CREATE TABLE IF NOT EXISTS budget_materials (
    id SERIAL PRIMARY KEY,
    budget_id INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    material_id INTEGER REFERENCES materials(id) ON DELETE SET NULL,
    label VARCHAR(300) NOT NULL,
    qty DECIMAL(10,2) NOT NULL DEFAULT 1,
    unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00 -- snapshot del costo al guardar
);

-- Líneas de mano de obra. employee_id nullable (mano de obra genérica).
CREATE TABLE IF NOT EXISTS budget_labor (
    id SERIAL PRIMARY KEY,
    budget_id INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    label VARCHAR(300) NOT NULL,
    hours DECIMAL(10,2) NOT NULL DEFAULT 0,
    hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 0.00 -- snapshot del costo/hora al guardar
);

-- Otros costos opcionales (fletes, consumibles, tercerizados, etc.)
CREATE TABLE IF NOT EXISTS budget_extras (
    id SERIAL PRIMARY KEY,
    budget_id INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    label VARCHAR(300) NOT NULL,
    amount DECIMAL(10,2) NOT NULL DEFAULT 0.00
);

-- Configuración simple clave/valor (ej. margen de ganancia por defecto)
CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO app_settings (key, value)
VALUES ('default_margin_pct', '30')
ON CONFLICT (key) DO NOTHING;

-- Índices
CREATE INDEX IF NOT EXISTS idx_budget_materials_budget ON budget_materials(budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_labor_budget ON budget_labor(budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_extras_budget ON budget_extras(budget_id);
CREATE INDEX IF NOT EXISTS idx_budgets_created_at ON budgets(created_at);

-- updated_at automático (reusa update_updated_at_column() creada en 01)
DROP TRIGGER IF EXISTS update_employees_updated_at ON employees;
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_budgets_updated_at ON budgets;
CREATE TRIGGER update_budgets_updated_at BEFORE UPDATE ON budgets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
