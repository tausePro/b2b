import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import Providers from "@/components/Providers";
import { buildWebMCPInlineScript } from "@/lib/webmcp/inlineScript";
import { getSiteUrl } from "@/lib/siteUrl";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Imprima B2B - Gestión de Pedidos Corporativos",
  description: "Plataforma de gestión de pedidos corporativos Imprima B2B",
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Script WebMCP server-rendered en el <head> con el origin canónico.
  // Se ejecuta antes de React hydration para que agentes IA detecten tools.
  const webmcpScript = buildWebMCPInlineScript({ origin: getSiteUrl() });

  return (
    <html lang="es">
      <head>
        <script
          id="webmcp-tools"
          dangerouslySetInnerHTML={{ __html: webmcpScript }}
        />
      </head>
      <body className={`${manrope.variable} font-display antialiased`} suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
