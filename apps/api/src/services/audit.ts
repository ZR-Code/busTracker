import type { PrismaClient } from '@prisma/client';

export async function audit(prisma: PrismaClient, actorId: string | null, action: string, summary: string): Promise<void> {
  await prisma.auditLog.create({ data: { actorId, action, summary: summary.slice(0, 300) } });
}
