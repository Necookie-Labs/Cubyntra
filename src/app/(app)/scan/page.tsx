import type { Metadata } from 'next';
import { ScanView } from '@/components/scan/ScanView';

export const metadata: Metadata = { title: 'Scan' };

export default function ScanPage() {
  return <ScanView />;
}
