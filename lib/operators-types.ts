// El tipo vive solo, sin importar nada, porque lo usan las dos orillas: las
// consultas del server (lib/operators.ts, que importa lib/database) y el
// administrador de operarios, que es un client component. Importar el tipo
// desde lib/operators arrastraría lib/database al bundle del cliente y rompería
// la página entera.
export interface Operator {
    id: number
    name: string
    active: boolean
}
