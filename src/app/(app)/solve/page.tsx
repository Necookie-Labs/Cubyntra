import type { Metadata } from 'next';
import { SolveView } from '@/components/solve/SolveView';

export const metadata: Metadata = { title: 'Solve' };

export default function SolvePage() {
  return <SolveView />;
}
