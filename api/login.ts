import { neon } from '@neondatabase/serverless';

async function ensureUserSettingsTable(sql: ReturnType<typeof neon>) {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS "user_settings" (
        "id" serial PRIMARY KEY,
        "teacher_id" varchar(50) DEFAULT 'default_teacher' CONSTRAINT "user_settings_teacher_id_key" UNIQUE,
        "password_hash" varchar(255) DEFAULT 'HPF' NOT NULL,
        "delay_morning" integer DEFAULT 0,
        "periods" jsonb DEFAULT '[]' NOT NULL,
        "evaluation_url" text,
        "holidays" jsonb DEFAULT '[]',
        "school_year_start" varchar(32) DEFAULT '2026-09-01',
        "default_grades" jsonb DEFAULT '["CE1", "CE2", "CM1", "CM2"]',
        "afternoon_wave_schedule" jsonb DEFAULT '{"open_days": 2, "pause_days": 2}',
        "delay_afternoon" integer DEFAULT 0 NOT NULL,
        "active_grades" text[],
        "auto_reschedule_enabled" boolean DEFAULT true,
        "delay_events" jsonb DEFAULT '[]'
      );
    `;
    const countRes = await sql`SELECT count(*)::int as count FROM "user_settings"`;
    if (countRes[0]?.count === 0) {
      await sql`
        INSERT INTO "user_settings" ("teacher_id", "password_hash")
        VALUES ('default_teacher', 'HPF')
        ON CONFLICT DO NOTHING;
      `;
    }
  } catch (err) {
    console.error("Erreur d'initialisation de la table user_settings dans login:", err);
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Méthode non autorisée' });
  }

  const { password } = req.body || {};

  if (!password || typeof password !== 'string' || !password.trim()) {
    return res.status(400).json({ success: false, message: 'Mot de passe requis' });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return res.status(500).json({
      success: false,
      message: "Variable DATABASE_URL non configurée dans le serveur."
    });
  }

  try {
    const sql = neon(dbUrl);
    await ensureUserSettingsTable(sql);

    // Interrogation directe de la base de données Neon PostgreSQL à chaque tentative de connexion
    const rows = await sql`SELECT password_hash FROM "user_settings" LIMIT 1`;

    if (!rows || rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Aucun mot de passe configuré dans la base de données."
      });
    }

    const storedPasswordHash = rows[0].password_hash;

    if (password.trim() === storedPasswordHash) {
      return res.status(200).json({ success: true, message: 'Authentification réussie' });
    } else {
      return res.status(401).json({ success: false, message: 'Mot de passe incorrect' });
    }
  } catch (error: any) {
    console.error("Erreur lors de la vérification du mot de passe en base de données:", error);
    return res.status(500).json({
      success: false,
      message: "Erreur lors de la vérification du mot de passe en base de données",
      error: error.message
    });
  }
}
