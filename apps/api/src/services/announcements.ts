import type { PrismaClient, Prisma } from '@prisma/client';
import type { AnnouncementDto, AnnouncementInput } from '@busbuddy/shared';
import { recipientsForRoutes, recipientsForSchool } from './audience';
import type { NotificationService } from './notifications';

const include = {
  routes: { include: { route: { select: { id: true, name: true, number: true } } } },
  publishedBy: { select: { name: true } },
} satisfies Prisma.ServiceAnnouncementInclude;

type Row = Prisma.ServiceAnnouncementGetPayload<{ include: typeof include }>;

export function toAnnouncementDto(a: Row, nowMs = Date.now()): AnnouncementDto {
  return {
    id: a.id,
    schoolId: a.schoolId,
    routes: a.routes.map((r) => r.route),
    title: a.title,
    body: a.body,
    severity: a.severity,
    category: a.category,
    publishedAt: a.publishedAt.toISOString(),
    expiresAt: a.expiresAt?.toISOString() ?? null,
    publishedBy: a.publishedBy?.name ?? null,
    isDemo: a.isDemo,
    active: a.publishedAt.getTime() <= nowMs && (!a.expiresAt || a.expiresAt.getTime() > nowMs),
  };
}

export class AnnouncementService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notifications: NotificationService,
  ) {}

  async listActive(schoolIds: string[] | 'all', routeId?: string): Promise<AnnouncementDto[]> {
    const now = new Date();
    const rows = await this.prisma.serviceAnnouncement.findMany({
      where: {
        ...(schoolIds === 'all' ? {} : { schoolId: { in: schoolIds } }),
        publishedAt: { lte: now },
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          ...(routeId ? [{ OR: [{ routes: { some: { routeId } } }, { routes: { none: {} } }] }] : []),
        ],
      },
      include,
      orderBy: { publishedAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => toAnnouncementDto(r));
  }

  async listAll(schoolIds: string[] | 'all'): Promise<AnnouncementDto[]> {
    const rows = await this.prisma.serviceAnnouncement.findMany({
      where: schoolIds === 'all' ? {} : { schoolId: { in: schoolIds } },
      include,
      orderBy: { publishedAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => toAnnouncementDto(r));
  }

  async get(id: string) {
    const row = await this.prisma.serviceAnnouncement.findUnique({ where: { id }, include });
    return row ? { row, dto: toAnnouncementDto(row) } : null;
  }

  async publish(input: AnnouncementInput, publishedById: string | null, opts: { isDemo?: boolean } = {}): Promise<AnnouncementDto> {
    const row = await this.prisma.serviceAnnouncement.create({
      data: {
        schoolId: input.schoolId,
        title: input.title,
        body: input.body,
        severity: input.severity,
        category: input.category,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        publishedById,
        isDemo: opts.isDemo ?? false,
        routes: { create: input.routeIds.map((routeId) => ({ routeId })) },
      },
      include,
    });
    if (input.notifyUsers) {
      const userIds = input.routeIds.length ? await recipientsForRoutes(this.prisma, input.routeIds) : await recipientsForSchool(this.prisma, input.schoolId);
      await this.notifications.createMany(
        userIds.map((userId) => ({
          userId,
          category: input.category,
          title: input.title,
          body: input.body,
          routeId: input.routeIds.length === 1 ? input.routeIds[0] : null,
          eventKey: `announcement:${row.id}`,
          isDemo: opts.isDemo ?? false,
        })),
      );
    }
    return toAnnouncementDto(row);
  }

  async update(id: string, input: AnnouncementInput): Promise<AnnouncementDto> {
    await this.prisma.$transaction([
      this.prisma.announcementRoute.deleteMany({ where: { announcementId: id } }),
      this.prisma.serviceAnnouncement.update({
        where: { id },
        data: {
          title: input.title,
          body: input.body,
          severity: input.severity,
          category: input.category,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          routes: { create: input.routeIds.map((routeId) => ({ routeId })) },
        },
      }),
    ]);
    return (await this.get(id))!.dto;
  }

  async expire(id: string): Promise<AnnouncementDto> {
    await this.prisma.serviceAnnouncement.update({ where: { id }, data: { expiresAt: new Date() } });
    return (await this.get(id))!.dto;
  }
}
