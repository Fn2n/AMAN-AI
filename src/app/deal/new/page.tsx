import { Suspense } from 'react';
import NewDealForm from './NewDealForm';

export default function NewDealPage() {
  return (
    <Suspense fallback={null}>
      <NewDealForm />
    </Suspense>
  );
}
