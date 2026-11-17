import type { Request, Response } from 'express';
import { successResponse } from '../../../interfaces/api-response.js';
import type { ReadStream } from 'node:fs';
import { logger } from '../../../config/logger.js';
import { errorResponse } from '../../../interfaces/api-response.js';
import { ValidationError } from '../../../utils/app-error.js';
import { FilesService } from '../services/files.service.js';
import type {
  ListFilesQueryInput,
  UpdateFileInput,
  UploadFileFieldsInput,
} from '../validators/files.validators.js';
import { uploadFileFieldsSchema } from '../validators/files.validators.js';

function contentDisposition(kind: 'attachment' | 'inline', originalName: string): string {
  const ascii = originalName
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_')
    .slice(0, 180) || 'file';
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(originalName)}`;
}

function pipeFile(res: Response, stream: ReadStream): void {
  stream.on('error', (error) => {
    logger.error('File stream failed', { error: error.message });
    if (!res.headersSent) {
      res.removeHeader('Content-Disposition');
      res.removeHeader('Content-Length');
      res.status(500).type('application/json').json(errorResponse('Failed to read the file'));
      return;
    }
    res.destroy(error);
  });
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

export class FilesController {
  constructor(private readonly service = new FilesService()) {}

  private actor(req: Request) {
    return {
      id: req.user!.id,
      permissions: req.user!.permissions,
    };
  }

  private meta(req: Request) {
    return {
      ip: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    };
  }

  summary = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.summary(this.actor(req));
    res.json(successResponse(data, 'Files summary'));
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.list(
      this.actor(req),
      req.query as unknown as ListFilesQueryInput,
    );
    res.json(successResponse(data, 'Files'));
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getById(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'File'));
  };

  upload = async (req: Request, res: Response): Promise<void> => {
    const file = req.file;
    if (!file) {
      throw new ValidationError('File is required');
    }

    const fields = uploadFileFieldsSchema.parse(req.body ?? {}) as UploadFileFieldsInput;
    const data = await this.service.upload(
      this.actor(req),
      {
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
        category: fields.category,
        title: fields.title,
        description: fields.description,
        employeeId: fields.employeeId,
        candidateId: fields.candidateId,
      },
      this.meta(req),
    );
    res.status(201).json(successResponse(data, 'File uploaded'));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.update(
      this.actor(req),
      req.params.id as string,
      req.body as UpdateFileInput,
      this.meta(req),
    );
    res.json(successResponse(data, 'File updated'));
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.remove(
      this.actor(req),
      req.params.id as string,
      this.meta(req),
    );
    res.json(successResponse(data, 'File deleted'));
  };

  download = async (req: Request, res: Response): Promise<void> => {
    const { file, stream } = await this.service.openForDownload(
      this.actor(req),
      req.params.id as string,
    );
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', contentDisposition('attachment', file.originalName));
    res.setHeader('Content-Length', String(file.sizeBytes));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    pipeFile(res, stream);
  };

  preview = async (req: Request, res: Response): Promise<void> => {
    const { file, stream } = await this.service.openForPreview(
      this.actor(req),
      req.params.id as string,
    );
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', contentDisposition('inline', file.originalName));
    res.setHeader('Content-Length', String(file.sizeBytes));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    pipeFile(res, stream);
  };
}
