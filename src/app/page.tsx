import { redirect } from 'next/navigation';

/** Root → dashboard. Middleware memantulkan yang belum login ke /auth. */
export default function Home() {
  redirect('/dashboard');
}
