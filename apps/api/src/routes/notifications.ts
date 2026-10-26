import { Router } from 'express';
import { idParamSchema, listQuerySchema, notificationQuerySchema } from '@busbuddy/shared';
import type { AppContext } from '../context';
import { notFound, parse } from '../lib/errors';
import { currentUser, requireAuth, scopeOf } from '../middleware/auth';
import { inScope } from '../services/access';

export function notificationsRouter(ctx: AppContext): Router {
  const r = Router();

  r.get('/notifications', requireAuth, async (req, res) => {
    const q = parse(notificationQuerySchema, req.query);
    res.set('Cache-Control', 'no-store');
    res.json(await ctx.notifications.list(currentUser(req).id, q));
  });

  r.get('/notifications/unread-count', requireAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ count: await ctx.notifications.unreadCount(currentUser(req).id) });
  });

  r.post('/notifications/read-all', requireAuth, async (req, res) => {
    res.json({ updated: await ctx.notifications.markAllRead(currentUser(req).id) });
  });

  r.post('/notifications/:id/read', requireAuth, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(await ctx.notifications.markRead(currentUser(req).id, id));
  });

  r.get('/announcements', requireAuth, async (req, res) => {
    const q = parse(listQuerySchema, req.query);
    const scope = await scopeOf(req);
    res.json(await ctx.announcements.listActive(scope.all ? 'all' : scope.ids, q.routeId));
  });

  r.get('/announcements/:id', requireAuth, async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const found = await ctx.announcements.get(id);
    if (!found || !inScope(await scopeOf(req), found.dto.schoolId)) throw notFound('Announcement');
    res.json(found.dto);
  });

  return r;
}
