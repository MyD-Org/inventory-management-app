/** @type {import('next').NextConfig} */
const nextConfig = {
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