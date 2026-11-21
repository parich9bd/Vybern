import { notFound } from 'next/navigation';
import Header from '@/components/layout/Header';
import { AdminModuleArea } from '@/components/admin/AdminModuleArea';
const sections = ['products', 'categories', 'orders', 'customers', 'inventory', 'payments', 'settings', 'notifications', 'audit'] as const;
export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) { const { section } = await params; if (!sections.includes(section as typeof sections[number])) notFound(); return <><Header /><AdminModuleArea section={section as typeof sections[number]} /></>; }
