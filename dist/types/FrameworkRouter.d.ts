import { Request, Response } from 'express';
export declare abstract class FrameworkRouter {
    basePath: string;
    constructor(basePath: string);
    abstract getRoutes(): Map<string, (req: Request, res: Response) => void>;
}
