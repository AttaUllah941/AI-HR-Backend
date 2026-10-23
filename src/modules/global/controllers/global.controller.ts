import type { Request, Response } from 'express';
import { successResponse } from '../../../interfaces/api-response.js';
import { GlobalService } from '../services/global.service.js';
import type {
  CreateBookmarkInput,
  GlobalSearchInput,
  UpdateBookmarkInput,
} from '../validators/global.validators.js';

export class GlobalController {
  constructor(private readonly service = new GlobalService()) {}

  private actor(req: Request) {
    return {
      id: req.user!.id,
      permissions: req.user!.permissions,
    };
  }

  search = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.search(
      this.actor(req),
      req.query as unknown as GlobalSearchInput,
    );
    res.json(successResponse(data, 'Search results'));
  };

  shortcuts = async (_req: Request, res: Response): Promise<void> => {
    const data = this.service.getShortcuts();
    res.json(successResponse(data, 'Keyboard shortcuts'));
  };

  listRecent = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listRecent(this.actor(req));
    res.json(successResponse(data, 'Recent searches'));
  };

  clearRecent = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.clearRecent(this.actor(req));
    res.json(successResponse(data, 'Recent searches cleared'));
  };

  deleteRecent = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteRecent(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Recent search deleted'));
  };

  listBookmarks = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listBookmarks(this.actor(req));
    res.json(successResponse(data, 'Bookmarks'));
  };

  createBookmark = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.createBookmark(
      this.actor(req),
      req.body as CreateBookmarkInput,
    );
    res.status(201).json(successResponse(data, 'Bookmark saved'));
  };

  updateBookmark = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.updateBookmark(
      this.actor(req),
      req.params.id as string,
      req.body as UpdateBookmarkInput,
    );
    res.json(successResponse(data, 'Bookmark updated'));
  };

  deleteBookmark = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.deleteBookmark(this.actor(req), req.params.id as string);
    res.json(successResponse(data, 'Bookmark deleted'));
  };
}
