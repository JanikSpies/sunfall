import type {Metadata} from "next";
import localFont from "next/font/local";
import "./globals.css";

const scienceGothic = localFont({
  src: "../raw-assets/ScienceGothic-VariableFont_CTRS,slnt,wdth,wght.ttf",
  variable: "--font-science-gothic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sunfall",
  description: "Sunfall Pixi game frontend",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${scienceGothic.variable} antialiased`}
    >
      <body className={scienceGothic.className}>{children}</body>
    </html>
  );
}
