import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/vazirmatn';
import { LOCALE_COOKIE_NAME, getDirection, resolveLocale } from '@portal/i18n';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { QueryProvider } from '@/lib/query-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'کنسول عملیات | تولید رنگ و پوشش‌های خودرو',
  description: 'سامانه مدیریت سفارش‌های تولید رنگ و پوشش، مشتریان، گردش کار و پشتیبانی',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const initialLocale = resolveLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const dir = getDirection(initialLocale);

  return (
    <html lang={initialLocale} dir={dir}>
      <body className="font-sans antialiased">
        <QueryProvider initialLocale={initialLocale}>{children}</QueryProvider>
      </body>
    </html>
  );
}
