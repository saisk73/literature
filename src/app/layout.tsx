import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Literature - Card Game',
  description: 'Play the Literature card game online with friends',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </head>
      <body className="text-white antialiased">{children}</body>
    </html>
  );
}
