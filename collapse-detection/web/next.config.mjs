/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // TF.js pulls in optional node bindings that must not break the browser bundle.
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.fallback = { ...(config.resolve.fallback || {}), fs: false };
    return config;
  },
};

export default nextConfig;
