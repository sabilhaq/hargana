import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { Geist } from "next/font/google";
import "./globals.css";
import { ServiceWorker } from "./service-worker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hargana",
  description: "Ingat harga, belanja lebih hemat.",
  applicationName: "Hargana",
  appleWebApp: { capable: true, title: "Hargana", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#15803d",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" dir="ltr" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
