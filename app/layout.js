import "./globals.css";

export const metadata = {
  title: "Media Vault — Physical Media Catalog",
  description: "AI-powered barcode scanning catalog for DVD, Blu-ray, and VHS collections",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
