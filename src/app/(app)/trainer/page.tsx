import type { Metadata } from 'next';
import { TrainerView } from '@/components/trainer/TrainerView';

export const metadata: Metadata = { title: 'Trainer' };

export default function TrainerPage() {
  return <TrainerView />;
}
