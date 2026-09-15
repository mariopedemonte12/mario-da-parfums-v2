import type { Metadata } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";

import ChatPanel from "@/features/chatbot-widget/components/ChatPanel";
import { ChatbotWidgetProvider } from "@/features/chatbot-widget/components/ChatbotWidgetProvider";
import Navbar from "@/features/layout/components/Navbar"
import Footer from "@/features/layout/components/Footer";
import { AuthProvider } from "@/features/auth/hooks/useAuth";
import { FavoritesProvider } from "@/features/favorites/hooks/useFavorites";

import "./globals.css";

const cormorantGaramond = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  title: "Mario da Parfums",
  description: "Tienda de perfumes",
};

export default function RootLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${cormorantGaramond.variable} ${jost.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <FavoritesProvider>
            <ChatbotWidgetProvider>
              <Navbar />

              <main className="flex-1">
                {children}
              </main>

              <Footer />

              <ChatPanel />
            </ChatbotWidgetProvider>
          </FavoritesProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
