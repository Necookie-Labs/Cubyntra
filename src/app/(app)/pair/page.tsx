import type { Metadata } from 'next';
import { PairView } from '@/components/placeholders/PairView';

export const metadata: Metadata = { title: 'Pair phone' };

export default function PairPage() {
  return <PairView />;
}
