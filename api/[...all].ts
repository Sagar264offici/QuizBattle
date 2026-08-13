import app from "../server/src/index.js";

export default function handler(req: any, res: any) {
  return app(req, res);
}
