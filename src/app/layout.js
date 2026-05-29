import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"] });

export const metadata = {
  title: "RankBox V2",
  description: "Track and rate your favorite Anime and TV Shows.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={outfit.className}>
        <div className="background-blob blob-1"></div>
        <div className="background-blob blob-2"></div>
        {children}
      </body>
    </html>
  );
}
