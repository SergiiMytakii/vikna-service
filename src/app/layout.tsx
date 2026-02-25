import type {Metadata} from "next";
import {Manrope, Playfair_Display} from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-body",
  subsets: ["latin", "cyrillic"],
});

const playfairDisplay = Playfair_Display({
  variable: "--font-heading",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "Вікна-Сервіс | Оплата через LiqPay",
  description:
    "Продаж та монтаж вікон, дверей і сонцезахисту. Онлайн-оплата замовлення через LiqPay.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk">
      <body className={`${manrope.variable} ${playfairDisplay.variable}`}>
        {children}
      </body>
    </html>
  );
}
