/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  trailingSlash: false,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
