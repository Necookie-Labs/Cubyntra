import type { Metadata } from 'next';
import { CubeSolutionView } from '@/components/cubes/CubeSolutionView';

export const metadata: Metadata = { title: 'Full solution' };

/** A saved cube's full solution. The cube lives in the student's profile, read on the client. */
export default async function CubeSolutionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CubeSolutionView id={id} />;
}
