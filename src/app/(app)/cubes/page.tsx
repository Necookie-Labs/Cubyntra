import type { Metadata } from 'next';
import { CubesView } from '@/components/cubes/CubesView';

export const metadata: Metadata = { title: 'My cubes' };

export default function CubesPage() {
  return <CubesView />;
}
