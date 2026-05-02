// api/upsert.ts
import { neon } from '@neondatabase/serverless';

export default async function handler(req: any, res: any) {
  // 1. Autoriser les requêtes POST uniquement
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const { studentId, competenceId, score, isStarted } = req.body;

  // 2. Utiliser la variable d'environnement (plus sécurisé et utilise le pooling de Vercel)
  // Si process.env.DATABASE_URL n'est pas trouvé, on utilise ton lien par défaut (mais privilégie la variable)
  const connectionString = process.env.DATABASE_URL;
  const sql = neon(connectionString);

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
    console.error("Erreur base de données:", error);
    return res.status(500).json({ error: error.message });
  }
}