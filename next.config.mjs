/** @type {import('next').NextConfig} */
const nextConfig = {
  // Carpeta de build. Es configurable para poder correr DOS dev servers sobre este
  // mismo repo a la vez (p. ej. el tuyo y uno de verificación en otro puerto): sin
  // esto los dos escriben .next y se corrompen los módulos entre ellos, con errores
  // del estilo "__webpack_modules__[moduleId] is not a function". Sin la variable,
  // se comporta como siempre.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },

  eslint: {
    ignoreDuringBuilds: true,
  },

  // Proxy same-origin hacia ai-api (evita CORS): el widget usa baseUrl '/ai-api'.
  async rewrites() {
    const aiApi = process.env.AI_API_BASE_URL
    if (!aiApi) return []
    return [{ source: "/ai-api/:path*", destination: `${aiApi}/:path*` }]
  },

  // `@vercel/flags-core` hace un require() opcional de `@vercel/flags-definitions`
  // (marcado con /* turbopackOptional */) que Turbopack sabe saltar pero Webpack no
  // — y ese paquete no existe en npm, es un stub generado. Sin este fallback, el build
  // de Next 14 en Vercel rompe con "Module not found: @vercel/flags-definitions".
  webpack: (config) => {
    config.resolve.fallback = {
      ...(config.resolve.fallback ?? {}),
      "@vercel/flags-definitions": false,
    }
    return config
  },
}

export default nextConfig