import type { PrismaClient } from '@prisma/client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AuthUser } from '../services/access';

export class SupabaseAuthVerifier {
  private readonly client: SupabaseClient;

  constructor(
    private readonly prisma: PrismaClient,
    url: string,
    anonKey: string,
  ) {
    this.client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async verify(accessToken: string): Promise<AuthUser | null> {
    const { data, error } = await this.client.auth.getUser(accessToken);
    if (error || !data.user) return null;
    const u = data.user;
    const existing = await this.prisma.user.findUnique({ where: { authProviderId: u.id } });
    if (existing) return pick(existing);
    const meta = (u.user_metadata ?? {}) as { name?: unknown; role?: unknown; schoolId?: unknown };
    const role = meta.role === 'parent' ? 'parent' : 'student';
    const schoolId = typeof meta.schoolId === 'string' ? meta.schoolId : null;
    const school = schoolId ? await this.prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } }) : null;
    const email = u.email?.toLowerCase() ?? null;
    const created = await this.prisma.user.create({
      data: {
        authProviderId: u.id,
        email: email && !(await this.prisma.user.findUnique({ where: { email } })) ? email : null,
        name: typeof meta.name === 'string' && meta.name.trim() ? meta.name.trim().slice(0, 80) : 'BusBuddy user',
        role,
        schoolId: school?.id ?? null,
        settings: { create: {} },
        ...(role === 'student' && school ? { studentProfile: { create: { schoolId: school.id } } } : {}),
      },
    });
    return pick(created);
  }
}

function pick(u: { id: string; name: string; email: string | null; role: AuthUser['role']; schoolId: string | null; isDemo: boolean }): AuthUser {
  return { id: u.id, name: u.name, email: u.email, role: u.role, schoolId: u.schoolId, isDemo: u.isDemo };
}
