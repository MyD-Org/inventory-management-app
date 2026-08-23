import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"
import path from "node:path"

// Tests de la lógica pura del módulo de pedidos: validación de specs, mapa de
// estados y cálculo de fechas. No tocan la base: lo que consulta a la base se
// inyecta (ver validateOrderPayload).
export default defineConfig({
    test: {
        environment: "node",
        include: ["lib/__tests__/**/*.test.ts"],
    },
    resolve: {
        alias: { "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".") },
    },
})
