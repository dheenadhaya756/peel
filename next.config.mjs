/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['typescript'],
  eslint: { ignoreDuringBuilds: true },
}
export default nextConfig
