-- Evolución del módulo de costos: "Empleados" pasa a "Recursos de mano de obra".
-- Un recurso puede ser un empleado propio, contratista, taller externo, instalador o
-- servicio tercerizado. El costo se define como VALOR POR MES; el costo por hora se
-- deriva en la app: monthly_value / app_settings.work_hours_per_month (default 192).

-- Renombrar tabla y adaptar columnas
ALTER TABLE employees RENAME TO labor_resources;
ALTER TABLE labor_resources ADD COLUMN IF NOT EXISTS role VARCHAR(100);
ALTER TABLE labor_resources ADD COLUMN IF NOT EXISTS monthly_value DECIMAL(12,2) NOT NULL DEFAULT 0.00;

-- Migrar dato existente: hourly_rate * 192 horas ≈ valor mensual equivalente
UPDATE labor_resources SET monthly_value = hourly_rate * 192 WHERE monthly_value = 0 AND hourly_rate > 0;
ALTER TABLE labor_resources DROP COLUMN IF EXISTS hourly_rate;

-- La FK de las líneas de mano de obra pasa a llamarse resource_id
-- (el snapshot budget_labor.hourly_rate se mantiene: es el costo/hora congelado por línea)
ALTER TABLE budget_labor RENAME COLUMN employee_id TO resource_id;

-- Horas laborales por mes para derivar el costo/hora
-- (L-V 8:00-17:30 = 9,5 h/día × ~21,7 días hábiles/mes ≈ 206)
INSERT INTO app_settings (key, value)
VALUES ('work_hours_per_month', '206')
ON CONFLICT (key) DO NOTHING;

-- Renombrar el trigger de updated_at al nuevo nombre de tabla
DROP TRIGGER IF EXISTS update_employees_updated_at ON labor_resources;
DROP TRIGGER IF EXISTS update_labor_resources_updated_at ON labor_resources;
CREATE TRIGGER update_labor_resources_updated_at BEFORE UPDATE ON labor_resources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
