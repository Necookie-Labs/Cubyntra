import type { Metadata } from 'next';
import { TimerView } from '@/components/placeholders/Placeholders';

export const metadata: Metadata = { title: 'Timer' };

export default function TimerPage() {
  return <TimerView />;
}
