import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <script defer src="/site-enhancements.js" />
      {children}
    </>
  );
}
