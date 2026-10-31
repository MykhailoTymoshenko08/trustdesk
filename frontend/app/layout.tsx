import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import "@fontsource-variable/inter-tight";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrustDesk",
  description: "An AI support agent you can actually trust",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col">
        <Nav />
        <main className="mx-auto w-full max-w-[1240px] flex-1 px-6 pb-24 pt-12">{children}</main>
      </body>
    </html>
  );
}
