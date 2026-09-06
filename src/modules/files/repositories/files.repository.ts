import type { FileCategory, Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';

const notDeleted = { deletedAt: null };

export type ListFilesQuery = {
  page: number;
  pageSize: number;
  category?: FileCategory;
  search?: string;
  employeeId?: string;
  candidateId?: string;
  uploadedById?: string;
};

export class FilesRepository {
  findUserContext(userId: string) {
    return prisma.user.findFirst({
      where: { id: userId, ...notDeleted },
      select: {
        id: true,
        companyId: true,
        email: true,
        employee: { select: { id: true } },
      },
    });
  }

  getCompanySettings(companyId: string) {
    return prisma.companySettings.findUnique({
      where: { companyId },
      select: {
        storageProvider: true,
        storageBucket: true,
        storageRegion: true,
        storagePublicBaseUrl: true,
      },
    });
  }

  findEmployee(companyId: string, employeeId: string) {
    return prisma.employee.findFirst({
      where: { id: employeeId, companyId, ...notDeleted },
      select: { id: true, firstName: true, lastName: true, employeeCode: true },
    });
  }

  findCandidate(companyId: string, candidateId: string) {
    return prisma.candidate.findFirst({
      where: { id: candidateId, companyId, ...notDeleted },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
  }

  countByCategory(companyId: string, scope?: Prisma.StoredFileWhereInput) {
    return prisma.storedFile.groupBy({
      by: ['category'],
      where: { companyId, ...notDeleted, ...(scope ?? {}) },
      _count: { _all: true },
      _sum: { sizeBytes: true },
    });
  }

  countFiles(companyId: string, scope?: Prisma.StoredFileWhereInput) {
    return prisma.storedFile.count({
      where: { companyId, ...notDeleted, ...(scope ?? {}) },
    });
  }

  sumSize(companyId: string, scope?: Prisma.StoredFileWhereInput) {
    return prisma.storedFile.aggregate({
      where: { companyId, ...notDeleted, ...(scope ?? {}) },
      _sum: { sizeBytes: true },
    });
  }

  list(companyId: string, query: ListFilesQuery, scope?: Prisma.StoredFileWhereInput) {
    const where: Prisma.StoredFileWhereInput = {
      companyId,
      ...notDeleted,
      ...(scope ?? {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.candidateId ? { candidateId: query.candidateId } : {}),
      ...(query.uploadedById ? { uploadedById: query.uploadedById } : {}),
      ...(query.search
        ? {
            OR: [
              { originalName: { contains: query.search, mode: 'insensitive' } },
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return Promise.all([
      prisma.storedFile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          uploadedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          employee: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          },
          candidate: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      prisma.storedFile.count({ where }),
    ]);
  }

  findById(companyId: string, id: string) {
    return prisma.storedFile.findFirst({
      where: { id, companyId, ...notDeleted },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
        },
        candidate: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  create(data: Prisma.StoredFileCreateInput) {
    return prisma.storedFile.create({
      data,
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
        },
        candidate: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  update(id: string, data: Prisma.StoredFileUpdateInput) {
    return prisma.storedFile.update({
      where: { id },
      data,
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
        },
        candidate: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  softDelete(id: string) {
    return prisma.storedFile.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  createEmployeeDocument(data: {
    employeeId: string;
    title: string;
    category: string;
    fileName: string;
    fileUrl: string;
    mimeType: string;
    fileSize: number;
    uploadedBy: string;
  }) {
    return prisma.employeeDocument.create({ data });
  }

  updateCandidateResume(
    candidateId: string,
    data: { resumeUrl: string; resumeFileName: string; resumeMimeType: string },
  ) {
    return prisma.candidate.update({
      where: { id: candidateId },
      data,
    });
  }

  updateUserAvatar(userId: string, avatarUrl: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });
  }

  createAuditLog(input: {
    actorId?: string;
    action: string;
    entityType?: string;
    entityId?: string;
    metadata?: Prisma.InputJsonValue;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return prisma.auditLog.create({ data: input });
  }
}
