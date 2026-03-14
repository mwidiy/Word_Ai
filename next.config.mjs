/** @type {import('next').NextConfig} */
const nextConfig = {
  // Matikan fitur-fitur yang tidak disupport oleh Internet Explorer / webview lama di Office Add-ins
  reactStrictMode: true,
  
  // Nonaktifkan routing history HTML5 sebentar atau polyfill
  // Office Add-in tidak mendukung manipulasi history URL
  // Ini mencegah error "window.history.replaceState is not a function"
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
};

export default nextConfig;
