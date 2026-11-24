import { Suspense } from 'react';
import DealView from './DealView';

export default function DealViewPage() {
  return (
    <Suspense fallback={null}>
      <DealView />
    </Suspense>
  );
}
