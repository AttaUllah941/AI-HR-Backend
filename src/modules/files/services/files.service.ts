import type { FileCategory, Prisma } from '@prisma/client';
import { env } from '../../../config/env.js';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../utils/app-error.js';
import {
  isPreviewableMime,
  localFileStorage,
} from '../../../services/storage/local-file-storage.js';
import { FilesRepository } from '../repositories/files.repository.js';
import type { UpdateFileInput } from '../validators/files.validators.js';

type AuthActor = { id: string; permissions: string[] };
type RequestMeta = { ip?: string; userAgent?: string };

function paginationMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize) || 1,
  };
}

function parsePage(params: Record<string, unknown>) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
  return { page, pageSize };
}

function emptyToNull(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return value;
}

function fileDownloadPath(id: string) {
  return `${env.API_PREFIX}/files/${id}/download`;
}

function filePreviewPath(id: string) {
  return `${env.API_PREFIX}/files/${id}/preview`;
}

function mapFile(row: {
  id: string;
  companyId: string;
  uploadedById: string | null;
  category: FileCategory;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  storageProvider: string;
  storageKey: string;
  checksumSha256: string | null;
  title: string | null;
  description: string | null;
  employeeId: string | null;
  candidateId: string | null;
  createdAt: Date;
  updatedAt: Date;
  uploadedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    employeeCode: string;
  } | null;
  candidate?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}) {
  return {
    id: row.id,
    companyId: row.companyId,
    category: row.category,
    originalName: row.originalName,
    storedName: row.storedName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    storageProvider: row.storageProvider,
    checksumSha256: row.checksumSha256,
    title: row.title,
    description: row.description,
    employeeId: row.employeeId,
    candidateId: row.candidateId,
    previewable: isPreviewableMime(row.mimeType),
    downloadUrl: fileDownloadPath(row.id),
    previewUrl: isPreviewableMime(row.mimeType) ? filePreviewPath(row.id) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    uploadedBy: row.uploadedBy ?? null,
    employee: row.employee ?? null,
    candidate: row.candidate ?? null,
  };
}

export class FilesService {
  constructor(private readonly repo = new FilesRepository()) {}

  private canBrowseCompany(actor: AuthActor) {
    return (
      actor.permissions.includes('files:create') ||
      actor.permissions.includes('files:update') ||
      actor.permissions.includes('files:delete') ||
      actor.permissions.includes('employees:view') ||
      actor.permissions.includes('recruitment:view') ||
      actor.permissions.includes('settings:view')
    );
  }

  private async requireContext(actor: AuthActor) {
    const user = await this.repo.findUserContext(actor.id);
    if (!user?.companyId) {
      throw new ForbiddenError('Your account is not linked to a company');
    }
    return user as {
      id: string;
      companyId: string;
      email: string;
      employee: { id: string } | null;
    };
  }

  private visibilityScope(
    actor: AuthActor,
    user: { id: string; employee: { id: string } | null },
  ): Prisma.StoredFileWhereInput | undefined {
    if (this.canBrowseCompany(actor)) {
      return undefined;
    }
    return {
      OR: [
        { uploadedById: user.id },
        ...(user.employee ? [{ employeeId: user.employee.id }] : []),
      ],
    };
  }

  private async assertCanAccess(
    actor: AuthActor,
    user: { id: string; employee: { id: string } | null },
    file: { uploadedById: string | null; employeeId: string | null },
  ) {
    if (this.canBrowseCompany(actor)) return;
    const owns =
      file.uploadedById === user.id ||
      (user.employee && file.employeeId === user.employee.id);
    if (!owns) {
      throw new ForbiddenError('You do not have access to this file');
    }
  }

  async summary(actor: AuthActor) {
    const user = await this.requireContext(actor);
    const scope = this.visibilityScope(actor, user);
    const [total, sizeAgg, byCategory, settings] = await Promise.all([
      this.repo.countFiles(user.companyId, scope),
      this.repo.sumSize(user.companyId, scope),
      this.repo.countByCategory(user.companyId, scope),
      this.repo.getCompanySettings(user.companyId),
    ]);

    const counts: Record<string, number> = {};
    for (const row of byCategory) {
      counts[row.category] = row._count._all;
    }

    return {
      totalFiles: total,
      totalBytes: sizeAgg._sum.sizeBytes ?? 0,
      maxUploadBytes: env.FILE_MAX_BYTES,
      countsByCategory: counts,
      storage: {
        provider: settings?.storageProvider ?? 'local',
        bucket: settings?.storageBucket ?? null,
        region: settings?.storageRegion ?? null,
        publicBaseUrl: settings?.storagePublicBaseUrl ?? null,
        runtimeProvider: 'local',
      },
    };
  }

  async list(actor: AuthActor, params: Record<string, unknown>) {
    const user = await this.requireContext(actor);
    const { page, pageSize } = parsePage(params);
    const search = typeof params.search === 'string' ? params.search.trim() : undefined;
    const category =
      typeof params.category === 'string' && params.category
        ? (params.category as FileCategory)
        : undefined;
    const employeeId =
      typeof params.employeeId === 'string' ? params.employeeId.trim() : undefined;
    const candidateId =
      typeof params.candidateId === 'string' ? params.candidateId.trim() : undefined;

    const scope = this.visibilityScope(actor, user);
    const [rows, total] = await this.repo.list(
      user.companyId,
      {
        page,
        pageSize,
        search: search || undefined,
        category,
        employeeId: employeeId || undefined,
        candidateId: candidateId || undefined,
      },
      scope,
    );

    return {
      items: rows.map(mapFile),
      pagination: paginationMeta(page, pageSize, total),
    };
  }

  async getById(actor: AuthActor, id: string) {
    const user = await this.requireContext(actor);
    const file = await this.repo.findById(user.companyId, id);
    if (!file) throw new NotFoundError('File not found');
    await this.assertCanAccess(actor, user, file);
    return mapFile(file);
  }

  async upload(
    actor: AuthActor,
    input: {
      buffer: Buffer;
      originalName: string;
      mimeType: string;
      category?: string;
      title?: string;
      description?: string;
      employeeId?: string;
      candidateId?: string;
    },
    meta: RequestMeta,
  ) {
    const user = await this.requireContext(actor);
    const category = (input.category as FileCategory) || 'GENERAL';
    const allowedCategories: FileCategory[] = [
      'GENERAL',
      'EMPLOYEE_DOCUMENT',
      'RESUME',
      'AVATAR',
      'POLICY',
      'OTHER',
    ];
    if (!allowedCategories.includes(category)) {
      throw new ValidationError('Invalid file category');
    }

    let employeeId = emptyToNull(input.employeeId) ?? null;
    let candidateId = emptyToNull(input.candidateId) ?? null;

    if (employeeId) {
      const employee = await this.repo.findEmployee(user.companyId, employeeId);
      if (!employee) throw new ValidationError('Employee not found');
    }
    if (candidateId) {
      const candidate = await this.repo.findCandidate(user.companyId, candidateId);
      if (!candidate) throw new ValidationError('Candidate not found');
    }

    if (category === 'EMPLOYEE_DOCUMENT' && !employeeId) {
      throw new ValidationError('employeeId is required for employee documents');
    }
    if (category === 'RESUME' && !candidateId) {
      throw new ValidationError('candidateId is required for resumes');
    }
    if (category === 'AVATAR') {
      employeeId = null;
      candidateId = null;
    }

    const settings = await this.repo.getCompanySettings(user.companyId);
    if (settings?.storageProvider && settings.storageProvider !== 'local') {
      // Cloud providers are configured in Settings; runtime still uses local until Phase integrations.
    }

    const blob = await localFileStorage.save(
      user.companyId,
      input.originalName,
      input.mimeType,
      input.buffer,
    );

    const file = await this.repo.create({
      company: { connect: { id: user.companyId } },
      uploadedBy: { connect: { id: actor.id } },
      category,
      originalName: blob.originalName,
      storedName: blob.storedName,
      mimeType: blob.mimeType,
      sizeBytes: blob.sizeBytes,
      storageProvider: blob.storageProvider,
      storageKey: blob.storageKey,
      checksumSha256: blob.checksumSha256,
      title: emptyToNull(input.title) ?? null,
      description: emptyToNull(input.description) ?? null,
      ...(employeeId ? { employee: { connect: { id: employeeId } } } : {}),
      ...(candidateId ? { candidate: { connect: { id: candidateId } } } : {}),
    });

    const downloadUrl = fileDownloadPath(file.id);

    if (category === 'EMPLOYEE_DOCUMENT' && employeeId) {
      await this.repo.createEmployeeDocument({
        employeeId,
        title: file.title || file.originalName,
        category: 'GENERAL',
        fileName: file.originalName,
        fileUrl: downloadUrl,
        mimeType: file.mimeType,
        fileSize: file.sizeBytes,
        uploadedBy: actor.id,
      });
    }

    if (category === 'RESUME' && candidateId) {
      await this.repo.updateCandidateResume(candidateId, {
        resumeUrl: downloadUrl,
        resumeFileName: file.originalName,
        resumeMimeType: file.mimeType,
      });
    }

    if (category === 'AVATAR') {
      await this.repo.updateUserAvatar(actor.id, filePreviewPath(file.id));
    }

    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'files.upload',
      entityType: 'StoredFile',
      entityId: file.id,
      metadata: {
        category,
        originalName: file.originalName,
        sizeBytes: file.sizeBytes,
        mimeType: file.mimeType,
      },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return mapFile(file);
  }

  async update(actor: AuthActor, id: string, input: UpdateFileInput, meta: RequestMeta) {
    const user = await this.requireContext(actor);
    const existing = await this.repo.findById(user.companyId, id);
    if (!existing) throw new NotFoundError('File not found');
    await this.assertCanAccess(actor, user, existing);

    let employeeId =
      input.employeeId !== undefined ? emptyToNull(input.employeeId) : undefined;
    let candidateId =
      input.candidateId !== undefined ? emptyToNull(input.candidateId) : undefined;

    if (employeeId) {
      const employee = await this.repo.findEmployee(user.companyId, employeeId);
      if (!employee) throw new ValidationError('Employee not found');
    }
    if (candidateId) {
      const candidate = await this.repo.findCandidate(user.companyId, candidateId);
      if (!candidate) throw new ValidationError('Candidate not found');
    }

    const file = await this.repo.update(id, {
      ...(input.title !== undefined ? { title: emptyToNull(input.title) } : {}),
      ...(input.description !== undefined
        ? { description: emptyToNull(input.description) }
        : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(employeeId !== undefined
        ? employeeId
          ? { employee: { connect: { id: employeeId } } }
          : { employee: { disconnect: true } }
        : {}),
      ...(candidateId !== undefined
        ? candidateId
          ? { candidate: { connect: { id: candidateId } } }
          : { candidate: { disconnect: true } }
        : {}),
    });

    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'files.update',
      entityType: 'StoredFile',
      entityId: id,
      metadata: { fields: Object.keys(input) },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return mapFile(file);
  }

  async remove(actor: AuthActor, id: string, meta: RequestMeta) {
    const user = await this.requireContext(actor);
    const existing = await this.repo.findById(user.companyId, id);
    if (!existing) throw new NotFoundError('File not found');
    await this.assertCanAccess(actor, user, existing);

    await this.repo.softDelete(id);
    try {
      await localFileStorage.remove(existing.storageKey);
    } catch {
      // soft-deleted even if disk cleanup fails
    }

    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'files.delete',
      entityType: 'StoredFile',
      entityId: id,
      metadata: { originalName: existing.originalName },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return { deleted: true };
  }

  async openForDownload(actor: AuthActor, id: string) {
    const user = await this.requireContext(actor);
    const file = await this.repo.findById(user.companyId, id);
    if (!file) throw new NotFoundError('File not found');
    await this.assertCanAccess(actor, user, file);
    const stream = localFileStorage.openReadStream(file.storageKey);
    return { file: mapFile(file), stream, disposition: 'attachment' as const };
  }

  async openForPreview(actor: AuthActor, id: string) {
    const user = await this.requireContext(actor);
    const file = await this.repo.findById(user.companyId, id);
    if (!file) throw new NotFoundError('File not found');
    await this.assertCanAccess(actor, user, file);
    if (!isPreviewableMime(file.mimeType)) {
      throw new ValidationError('This file type cannot be previewed in-browser');
    }
    const stream = localFileStorage.openReadStream(file.storageKey);
    return { file: mapFile(file), stream, disposition: 'inline' as const };
  }
}
