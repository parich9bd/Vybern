import Header from '@/components/layout/Header';

export default function AccountLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <><Header />{children}</>;
}
