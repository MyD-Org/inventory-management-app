// Conexión de los scripts de línea de comando.
//
// POR QUÉ EXISTE ESTE ARCHIVO: los scripts arman su propia conexión con
// neon(DATABASE_URL), y el driver serverless habla SQL-sobre-HTTP contra el
// endpoint de Neon. Eso significa que, aunque el entorno local esté configurado
// con NEON_LOCAL_PROXY —como dice docs/local-dev.md—, un script iba igual al Neon
// de verdad. La app no tenía el problema porque carga lib/neon-local.ts, que
// redirige el driver; los scripts no lo cargan (es TypeScript, no se puede
// require desde acá).
//
// El resultado era el peor posible: correr una migración "en local" la aplicaba
// en producción, sin decir una palabra. Acá se arregla en un solo lugar y, sobre
// todo, SE DICE CONTRA QUÉ BASE SE ESTÁ POR ESCRIBIR antes de escribir nada.
const { neon, neonConfig } = require("@neondatabase/serverless")

require("dotenv").config({ path: ".env.local" })
require("dotenv").config()

/** "ep-xxx.neon.tech/avantec". Sin usuario ni contraseña: esto se imprime. */
function describeTarget(url) {
    try {
        const u = new URL(url)
        return `${u.hostname}${u.pathname}`
    } catch {
        return "(DATABASE_URL con formato raro)"
    }
}

/**
 * El cliente sql de los scripts, ya apuntado a donde corresponde.
 *
 * Imprime la base y si va por el proxy local o al Neon remoto. Es una línea de
 * ruido a cambio de que nadie más aplique una migración en producción creyendo
 * que la está probando en su máquina.
 */
function connect() {
    if (!process.env.DATABASE_URL) {
        console.error("❌ DATABASE_URL is not set")
        process.exit(1)
    }

    const proxy = process.env.NEON_LOCAL_PROXY
    if (proxy) neonConfig.fetchEndpoint = proxy

    console.log(
        proxy
            ? `▶ Base: ${describeTarget(process.env.DATABASE_URL)} (LOCAL, vía ${proxy})`
            : `▶ Base: ${describeTarget(process.env.DATABASE_URL)} (Neon REMOTO)`,
    )

    return neon(process.env.DATABASE_URL)
}

module.exports = { connect, describeTarget }
