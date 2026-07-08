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
}

export default nextConfig