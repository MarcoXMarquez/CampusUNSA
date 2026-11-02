import type { Metadata, Viewport } from "next";
import KonstaProvider from "@/components/KonstaProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "CampusUNSA",
  description: "Hub Académico de entregas y recordatorios para la Universidad Nacional de San Agustín",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "CampusUNSA",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2F2F7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <KonstaProvider>{children}</KonstaProvider>
      </body>
    </html>
  );
}
