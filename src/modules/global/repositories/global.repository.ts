import type { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';

const notDeleted = { deletedAt: null };

export class GlobalRepository {
  findUserCompanyId(userId: string) {
    return prisma.user.findFirst({
      where: { id: userId, ...notDeleted },
      select: { id: true, companyId: true },
    });
  }

  searchEmployees(companyId: string, q: string, take: number, extra?: { departmentId?: string; status?: string }) {
    return prisma.employee.findMany({
      where: {
        companyId,
        ...notDeleted,
        ...(extra?.departmentId ? { departmentId: extra.departmentId } : {}),
        ...(extra?.status ? { status: extra.status as never } : {}),
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { employeeCode: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { personalEmail: { contains: q, mode: 'insensitive' } },
        ],
      },
      take,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
        email: true,
        status: true,
        updatedAt: true,
        department: { select: { id: true, name: true } },
      },
    });
  }

  searchDepartments(companyId: string, q: string, take: number) {
    return prisma.department.findMany({
      where: {
        companyId,
        ...notDeleted,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { code: { contains: q, mode: 'insensitive' } },
        ],
      },
      take,
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, updatedAt: true },
    });
  }

  searchBranches(companyId: string, q: string, take: number) {
    return prisma.branch.findMany({
      where: {
        companyId,
        ...notDeleted,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { code: { contains: q, mode: 'insensitive' } },
        ],
      },
      take,
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, updatedAt: true },
    });
  }

  searchCandidates(companyId: string, q: string, take: number) {
    return prisma.candidate.findMany({
      where: {
        companyId,
        ...notDeleted,
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      },
      take,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        currentTitle: true,
        updatedAt: true,
      },
    });
  }

  searchJobs(companyId: string, q: string, take: number) {
    return prisma.jobOpening.findMany({
      where: {
        companyId,
        ...notDeleted,
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { code: { contains: q, mode: 'insensitive' } },
        ],
      },
      take,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, code: true, status: true, updatedAt: true },
    });
  }

  searchFiles(
    companyId: string,
    q: string,
    take: number,
    extra?: { category?: string },
  ) {
    return prisma.storedFile.findMany({
      where: {
        companyId,
        ...notDeleted,
        ...(extra?.category ? { category: extra.category as never } : {}),
        OR: [
          { originalName: { contains: q, mode: 'insensitive' } },
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      },
      take,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        originalName: true,
        title: true,
        category: true,
        mimeType: true,
        updatedAt: true,
      },
    });
  }

  searchUsers(companyId: string, q: string, take: number) {
    return prisma.user.findMany({
      where: {
        companyId,
        ...notDeleted,
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      },
      take,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        updatedAt: true,
      },
    });
  }

  listBookmarks(userId: string) {
    return prisma.searchBookmark.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  findBookmark(userId: string, id: string) {
    return prisma.searchBookmark.findFirst({ where: { id, userId } });
  }

  createBookmark(data: {
    userId: string;
    title: string;
    route: string;
    entityType?: string | null;
    entityId?: string | null;
    query?: string | null;
    icon?: string | null;
  }) {
    return prisma.searchBookmark.upsert({
      where: {
        userId_route_entityId: {
          userId: data.userId,
          route: data.route,
          entityId: data.entityId ?? '',
        },
      },
      create: {
        userId: data.userId,
        title: data.title,
        route: data.route,
        entityType: data.entityType ?? null,
        entityId: data.entityId ?? '',
        query: data.query ?? null,
        icon: data.icon ?? null,
      },
      update: {
        title: data.title,
        entityType: data.entityType ?? null,
        query: data.query ?? null,
        icon: data.icon ?? null,
      },
    });
  }

  updateBookmark(
    id: string,
    data: Prisma.SearchBookmarkUpdateInput,
  ) {
    return prisma.searchBookmark.update({ where: { id }, data });
  }

  deleteBookmark(id: string) {
    return prisma.searchBookmark.delete({ where: { id } });
  }

  listRecentSearches(userId: string, take = 12) {
    return prisma.recentSearch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  createRecentSearch(data: {
    userId: string;
    query: string;
    types: string[];
    filters?: Prisma.InputJsonValue;
    resultCount: number;
  }) {
    return prisma.$transaction(async (tx) => {
      // Deduplicate identical recent query for same user
      await tx.recentSearch.deleteMany({
        where: {
          userId: data.userId,
          query: { equals: data.query, mode: 'insensitive' },
        },
      });
      const created = await tx.recentSearch.create({ data });
      const extras = await tx.recentSearch.findMany({
        where: { userId: data.userId },
        orderBy: { createdAt: 'desc' },
        skip: 20,
        select: { id: true },
      });
      if (extras.length) {
        await tx.recentSearch.deleteMany({
          where: { id: { in: extras.map((e) => e.id) } },
        });
      }
      return created;
    });
  }

  deleteRecentSearch(userId: string, id: string) {
    return prisma.recentSearch.deleteMany({ where: { id, userId } });
  }

  clearRecentSearches(userId: string) {
    return prisma.recentSearch.deleteMany({ where: { userId } });
  }
}
