import { describe, expect, it } from 'vitest';
import { assertAdminCanManage, inScope, scopeWhere, type AuthUser } from '../../src/services/access';

const user = (over: Partial<AuthUser>): AuthUser => ({ id: 'u', name: 'U', email: null, role: 'student', schoolId: 's1', isDemo: false, ...over });

describe('authorization helpers', () => {
  it('rejects non-admins', () => {
    expect(() => assertAdminCanManage(user({ role: 'student' }), 's1')).toThrow(/Administrator/);
    expect(() => assertAdminCanManage(user({ role: 'parent' }), 's1')).toThrow();
  });
  it('limits school administrators to their school', () => {
    expect(() => assertAdminCanManage(user({ role: 'admin', schoolId: 's1' }), 's1')).not.toThrow();
    expect(() => assertAdminCanManage(user({ role: 'admin', schoolId: 's1' }), 's2')).toThrow(/own school/);
  });
  it('lets district-wide administrators manage any school', () => {
    expect(() => assertAdminCanManage(user({ role: 'admin', schoolId: null }), 's9')).not.toThrow();
  });
  it('builds scope filters', () => {
    expect(inScope({ all: false, ids: ['a'] }, 'b')).toBe(false);
    expect(inScope({ all: true }, 'b')).toBe(true);
    expect(scopeWhere({ all: false, ids: ['a'] })).toEqual({ schoolId: { in: ['a'] } });
  });
});
