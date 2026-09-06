import type { Request, Response } from 'express';
import { successResponse } from '../../../interfaces/api-response.js';
import { ValidationError } from '../../../utils/app-error.js';
import { FilesService } from '../services/files.service.js';
import type { UpdateFileInput } from '../validators/files.validators.js';

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
      req.query as Record<string, unknown>,
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

    const body = req.body as Record<string, string | undefined>;
    const data = await this.service.upload(
      this.actor(req),
      {
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
        category: body.category,
        title: body.title,
        description: body.description,
        employeeId: body.employeeId,
        candidateId: body.candidateId,
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
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.originalName)}"`,
    );
    res.setHeader('Content-Length', String(file.sizeBytes));
    stream.pipe(res);
  };

  preview = async (req: Request, res: Response): Promise<void> => {
    const { file, stream } = await this.service.openForPreview(
      this.actor(req),
      req.params.id as string,
    );
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(file.originalName)}"`,
    );
    res.setHeader('Content-Length', String(file.sizeBytes));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    stream.pipe(res);
  };
}
