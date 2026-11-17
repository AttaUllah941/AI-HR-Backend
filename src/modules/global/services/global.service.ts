import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../utils/app-error.js';
import { GlobalRepository } from '../repositories/global.repository.js';
import type {
  CreateBookmarkInput,
  GlobalSearchInput,
  UpdateBookmarkInput,
} from '../validators/global.validators.js';
import { searchTypes } from '../validators/global.validators.js';
import { parsePagination, paginationMeta } from '../../../utils/pagination.js';

type AuthActor = { id: string; permissions: string[] };

export type SearchHit = {
  id: string;
  type: (typeof searchTypes)[number];
  title: string;
  subtitle: string;
  route: string;
  icon: string;
  status?: string | null;
  updatedAt: string;
  meta?: Record<string, unknown>;
};

const TYPE_PERMISSION: Record<(typeof searchTypes)[number], string> = {
  employees: 'employees:view',
  departments: 'organization:view',
  branches: 'organization:view',
  candidates: 'recruitment:view',
  jobs: 'recruitment:view',
  files: 'files:view',
  users: 'users:view',
};

const KEYBOARD_SHORTCUTS = [
  {
    id: 'global-search',
    keys: ['Ctrl', 'K'],
    macKeys: ['⌘', 'K'],
    action: 'Open global search',
    scope: 'Global',
  },
  {
    id: 'shortcuts-help',
    keys: ['Ctrl', '/'],
    macKeys: ['⌘', '/'],
    action: 'Show keyboard shortcuts',
    scope: 'Global',
  },
  {
    id: 'close-dialog',
    keys: ['Esc'],
    macKeys: ['Esc'],
    action: 'Close dialog / palette',
    scope: 'Global',
  },
  {
    id: 'nav-dashboard',
    keys: ['G', 'D'],
    macKeys: ['G', 'D'],
    action: 'Go to dashboard',
    scope: 'Navigation',
  },
  {
    id: 'nav-employees',
    keys: ['G', 'E'],
    macKeys: ['G', 'E'],
    action: 'Go to employees',
    scope: 'Navigation',
  },
  {
    id: 'nav-files',
    keys: ['G', 'F'],
    macKeys: ['G', 'F'],
    action: 'Go to documents',
    scope: 'Navigation',
  },
  {
    id: 'nav-profile',
    keys: ['G', 'P'],
    macKeys: ['G', 'P'],
    action: 'Go to profile',
    scope: 'Navigation',
  },
  {
    id: 'nav-search',
    keys: ['G', 'S'],
    macKeys: ['G', 'S'],
    action: 'Go to search',
    scope: 'Navigation',
  },
];

function hasPerm(actor: AuthActor, code: string) {
  return actor.permissions.includes(code);
}

export class GlobalService {
  constructor(private readonly repo = new GlobalRepository()) {}

  private async requireCompanyContext(userId: string) {
    const user = await this.repo.findUserContext(userId);
    if (!user?.companyId) {
      throw new ForbiddenError('Your account is not linked to a company');
    }
    return user as {
      id: string;
      companyId: string;
      employee: { id: string } | null;
    };
  }

  /** Matches files module: non-staff only see own uploads / linked employee docs. */
  private canBrowseCompanyFiles(actor: AuthActor) {
    return (
      actor.permissions.includes('files:create') ||
      actor.permissions.includes('files:update') ||
      actor.permissions.includes('files:delete') ||
      actor.permissions.includes('employees:view') ||
      actor.permissions.includes('recruitment:view') ||
      actor.permissions.includes('settings:view')
    );
  }

  private parseRequestedTypes(typesCsv?: string): (typeof searchTypes)[number][] {
    if (!typesCsv?.trim()) {
      return [...searchTypes];
    }
    const parts = typesCsv
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const invalid = parts.filter((t) => !(searchTypes as readonly string[]).includes(t));
    if (invalid.length) {
      throw new ValidationError(`Invalid search types: ${invalid.join(', ')}`);
    }
    return parts as (typeof searchTypes)[number][];
  }

  getShortcuts() {
    return { items: KEYBOARD_SHORTCUTS };
  }

  async search(actor: AuthActor, params: GlobalSearchInput) {
    const user = await this.requireCompanyContext(actor.id);
    const companyId = user.companyId;
    const q = params.q.trim();
    if (q.length < 1) {
      throw new ValidationError('Search query is required');
    }

    const { page, pageSize } = parsePagination(
      { page: params.page, pageSize: params.pageSize },
      { maxPageSize: 50 },
    );
    const sortBy = params.sortBy ?? 'relevance';
    const sortDir = params.sortDir ?? 'desc';
    const saveRecent = params.saveRecent !== false;

    const requestedTypes = this.parseRequestedTypes(params.types);
    const enabledTypes = requestedTypes.filter((t) => hasPerm(actor, TYPE_PERMISSION[t]));
    const perTypeTake = Math.min(30, pageSize * 2);
    const hits: SearchHit[] = [];

    const filters = {
      departmentId: params.departmentId,
      status: params.status,
      category: params.category,
    };

    const fileVisibility = this.canBrowseCompanyFiles(actor)
      ? undefined
      : {
          uploadedById: user.id,
          employeeId: user.employee?.id ?? null,
        };

    await Promise.all(
      enabledTypes.map(async (type) => {
        if (type === 'employees') {
          const rows = await this.repo.searchEmployees(companyId, q, perTypeTake, {
            departmentId: filters.departmentId,
            status: filters.status,
          });
          for (const row of rows) {
            hits.push({
              id: row.id,
              type,
              title: `${row.firstName} ${row.lastName}`.trim(),
              subtitle: `${row.employeeCode}${row.department ? ` · ${row.department.name}` : ''}`,
              route: `/employees/${row.id}`,
              icon: 'badge',
              status: row.status,
              updatedAt: row.updatedAt.toISOString(),
              meta: { email: row.email, departmentId: row.department?.id },
            });
          }
        } else if (type === 'departments') {
          const rows = await this.repo.searchDepartments(companyId, q, perTypeTake);
          for (const row of rows) {
            hits.push({
              id: row.id,
              type,
              title: row.name,
              subtitle: row.code,
              route: `/organization/departments`,
              icon: 'account_tree',
              updatedAt: row.updatedAt.toISOString(),
            });
          }
        } else if (type === 'branches') {
          const rows = await this.repo.searchBranches(companyId, q, perTypeTake);
          for (const row of rows) {
            hits.push({
              id: row.id,
              type,
              title: row.name,
              subtitle: row.code,
              route: `/organization/branches`,
              icon: 'store',
              updatedAt: row.updatedAt.toISOString(),
            });
          }
        } else if (type === 'candidates') {
          const rows = await this.repo.searchCandidates(companyId, q, perTypeTake);
          for (const row of rows) {
            hits.push({
              id: row.id,
              type,
              title: `${row.firstName} ${row.lastName}`.trim(),
              subtitle: row.currentTitle || row.email,
              route: `/recruitment/candidates`,
              icon: 'person_search',
              updatedAt: row.updatedAt.toISOString(),
              meta: { email: row.email },
            });
          }
        } else if (type === 'jobs') {
          const rows = await this.repo.searchJobs(companyId, q, perTypeTake);
          for (const row of rows) {
            hits.push({
              id: row.id,
              type,
              title: row.title,
              subtitle: row.code,
              route: `/recruitment/jobs`,
              icon: 'work',
              status: row.status,
              updatedAt: row.updatedAt.toISOString(),
            });
          }
        } else if (type === 'files') {
          const rows = await this.repo.searchFiles(companyId, q, perTypeTake, {
            category: filters.category,
            visibility: fileVisibility,
          });
          for (const row of rows) {
            hits.push({
              id: row.id,
              type,
              title: row.title || row.originalName,
              subtitle: `${row.category} · ${row.mimeType}`,
              route: `/files/library`,
              icon: 'description',
              updatedAt: row.updatedAt.toISOString(),
              meta: { fileId: row.id },
            });
          }
        } else if (type === 'users') {
          const rows = await this.repo.searchUsers(companyId, q, perTypeTake);
          for (const row of rows) {
            hits.push({
              id: row.id,
              type,
              title: `${row.firstName} ${row.lastName}`.trim(),
              subtitle: row.email,
              route: `/settings/users`,
              icon: 'group',
              status: row.status,
              updatedAt: row.updatedAt.toISOString(),
            });
          }
        }
      }),
    );

    const qLower = q.toLowerCase();
    const scored = hits.map((hit) => {
      const title = hit.title.toLowerCase();
      const subtitle = hit.subtitle.toLowerCase();
      let score = 0;
      if (title === qLower) score += 100;
      else if (title.startsWith(qLower)) score += 80;
      else if (title.includes(qLower)) score += 50;
      if (subtitle.includes(qLower)) score += 20;
      return { hit, score };
    });

    scored.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortBy === 'title') {
        return a.hit.title.localeCompare(b.hit.title) * (sortDir === 'asc' ? 1 : -1);
      }
      if (sortBy === 'updatedAt') {
        return (new Date(a.hit.updatedAt).getTime() - new Date(b.hit.updatedAt).getTime()) * dir;
      }
      if (sortBy === 'type') {
        return a.hit.type.localeCompare(b.hit.type) * (sortDir === 'asc' ? 1 : -1);
      }
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.hit.updatedAt).getTime() - new Date(a.hit.updatedAt).getTime();
    });

    const total = scored.length;
    const start = (page - 1) * pageSize;
    const items = scored.slice(start, start + pageSize).map((s) => s.hit);

    const countsByType: Record<string, number> = {};
    for (const s of scored) {
      countsByType[s.hit.type] = (countsByType[s.hit.type] ?? 0) + 1;
    }

    if (saveRecent) {
      await this.repo.createRecentSearch({
        userId: actor.id,
        query: q,
        types: enabledTypes,
        filters: {
          departmentId: filters.departmentId ?? null,
          status: filters.status ?? null,
          category: filters.category ?? null,
          sortBy,
          sortDir,
        },
        resultCount: total,
      });
    }

    return {
      query: q,
      types: enabledTypes,
      availableTypes: searchTypes.filter((t) => hasPerm(actor, TYPE_PERMISSION[t])),
      countsByType,
      items,
      pagination: paginationMeta(page, pageSize, total),
      sort: { sortBy, sortDir },
      filters: {
        departmentId: filters.departmentId ?? null,
        status: filters.status ?? null,
        category: filters.category ?? null,
      },
    };
  }

  async listRecent(actor: AuthActor) {
    await this.requireCompanyContext(actor.id);
    const items = await this.repo.listRecentSearches(actor.id);
    return { items };
  }

  async clearRecent(actor: AuthActor) {
    await this.requireCompanyContext(actor.id);
    await this.repo.clearRecentSearches(actor.id);
    return { cleared: true };
  }

  async deleteRecent(actor: AuthActor, id: string) {
    await this.requireCompanyContext(actor.id);
    await this.repo.deleteRecentSearch(actor.id, id);
    return { deleted: true };
  }

  async listBookmarks(actor: AuthActor) {
    await this.requireCompanyContext(actor.id);
    const items = await this.repo.listBookmarks(actor.id);
    return { items };
  }

  async createBookmark(actor: AuthActor, input: CreateBookmarkInput) {
    await this.requireCompanyContext(actor.id);
    const item = await this.repo.createBookmark({
      userId: actor.id,
      title: input.title,
      route: input.route,
      entityType: input.entityType,
      entityId: input.entityId,
      query: input.query,
      icon: input.icon,
    });
    return item;
  }

  async updateBookmark(actor: AuthActor, id: string, input: UpdateBookmarkInput) {
    await this.requireCompanyContext(actor.id);
    const existing = await this.repo.findBookmark(actor.id, id);
    if (!existing) throw new NotFoundError('Bookmark not found');
    try {
      return await this.repo.updateBookmark(id, {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.route !== undefined ? { route: input.route } : {}),
        ...(input.entityType !== undefined ? { entityType: input.entityType } : {}),
        ...(input.entityId !== undefined ? { entityId: input.entityId ?? '' } : {}),
        ...(input.query !== undefined ? { query: input.query } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new ConflictError('A bookmark for this route already exists');
      }
      throw error;
    }
  }

  async deleteBookmark(actor: AuthActor, id: string) {
    await this.requireCompanyContext(actor.id);
    const existing = await this.repo.findBookmark(actor.id, id);
    if (!existing) throw new NotFoundError('Bookmark not found');
    await this.repo.deleteBookmark(id);
    return { deleted: true };
  }
}
