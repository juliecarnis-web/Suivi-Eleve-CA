import { neon } from '@neondatabase/serverless';

export default async function handler(_req: any, res: any) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return res.status(200).json({
      connected: false,
      message: "Variable DATABASE_URL non définie dans l'environnement."
    });
  }

  try {
    const sql = neon(dbUrl);
    const result = await sql`SELECT NOW() as current_time, version()`;
    return res.status(200).json({
      connected: true,
      message: "Connexion à Neon PostgreSQL réussie !",
      timestamp: result[0]?.current_time,
      version: result[0]?.version
    });
  } catch (error: any) {
    return res.status(500).json({
      connected: false,
      message: "Erreur lors de la connexion à Neon",
      error: error.message
    });
  }
}
