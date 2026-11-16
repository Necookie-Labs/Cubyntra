import type { Metadata } from 'next';
import { ProgressView } from '@/components/placeholders/Placeholders';

export const metadata: Metadata = { title: 'Progress' };

export default function ProgressPage() {
  return <ProgressView />;
}
