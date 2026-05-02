// api/upsert.ts
import { neon } from '@neondatabase/serverless';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { studentId, competenceId, score, isStarted } = req.body;
  const sql = neon('postgresql://neondb_owner:npg_H02jNElaQogn@ep-cold-truth-aljkhk6v.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require');

  try {
    await sql`
      INSERT INTO "Result" ("studentId", "competenceId", "score", "isStarted", "updatedAt")
      VALUES (${studentId}, ${competenceId}, ${score}, ${isStarted}, NOW())
      ON CONFLICT ("studentId", "competenceId") DO UPDATE SET
        "score" = EXCLUDED."score",
        "isStarted" = EXCLUDED."isStarted",
        "updatedAt" = NOW()
    `;
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}