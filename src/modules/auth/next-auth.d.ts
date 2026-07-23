import 'next-auth';
import 'next-auth/jwt';

/** Augmentasi tipe: session & JWT membawa identitas tenant. */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      tenantId: string;
      role: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    tenantId?: string;
    role?: string;
  }
}
