import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SunHub · Techos Rentables",
  description:
    "Plataforma unificada de operación solar — 200+ plantas, múltiples marcas, un solo sistema.",
  manifest: "/manifest.webmanifest",
  applicationName: "SunHub",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SunHub",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
      { url: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#006b2c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-sunhub-bg text-slate-900 antialiased">{children}</body>
    </html>
  );
}
