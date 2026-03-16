import type { Metadata } from "next";
import { AppNav } from "@/components/app-nav";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Vytronix AI Engine",
  description: "Framework interno de agentes IA para Vytronix"
};

type RootLayoutProps = {
  children: React.ReactNode;
};

const RootLayout = ({ children }: RootLayoutProps) => {
  return (
    <html lang="es">
      <body>
        <AppNav />
        <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
};

export default RootLayout;
