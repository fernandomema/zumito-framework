import { Request, Response } from 'express';

export abstract class FrameworkRouter {
    basePath: string = '';

    constructor(basePath: string) {
        this.basePath = basePath;
    }

    abstract getRoutes(): Map<string, (req: Request, res: Response) => void>;
}