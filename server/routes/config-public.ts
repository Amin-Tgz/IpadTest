import { Router, type Request, type Response } from "express";

export const PUBLIC_CONFIG_SCHEMA_VERSION = "1.0";

export function configPublicRoute(modelName: string) {
  const router = Router();

  router.get("/", (_req: Request, res: Response) => {
    res.json({
      schemaVersion: PUBLIC_CONFIG_SCHEMA_VERSION,
      model: modelName,
      features: {
        jointEditor: true,
        drawingAnalysis: true,
      },
    });
  });

  return router;
}
