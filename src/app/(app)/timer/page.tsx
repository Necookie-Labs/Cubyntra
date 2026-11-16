import type { Metadata } from 'next';
import { TimerView } from '@/components/timer/TimerView';

export const metadata: Metadata = { title: 'Timer' };

export default function TimerPage() {
  return <TimerView />;
}
