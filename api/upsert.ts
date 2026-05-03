import { neon } from '@neondatabase/serverless';

export default async function handler(req: any, res: any) {
  const sql = neon(process.env.DATABASE_URL!);

  // CAS 1 : LECTURE (GET) - Pour afficher les élèves et les compétences
  if (req.method === 'GET') {
    try {
      const students = await sql`SELECT * FROM "Student" ORDER BY "lastName" ASC`;
      const competencies = await sql`SELECT * FROM "Competence" ORDER BY "code" ASC`;
      const results = await sql`SELECT * FROM "Result"`;
      
      return res.status(200).json({ students, competencies, results });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  // CAS 2 : ÉCRITURE (POST) - Pour les notes, les élèves et le CSV
  if (req.method === 'POST') {
    const { action, studentId, competenceId, score, isStarted, firstName, lastName, grade } = req.body;

    try {
      // Action spécifique pour VIDER les tables (Boutons Admin)
      if (action === 'clear') {
        const { table } = req.body;
        if (table === 'Result') await sql`TRUNCATE TABLE "Result" RESTART IDENTITY CASCADE`;
        if (table === 'Student') await sql`TRUNCATE TABLE "Student" CASCADE`;
        return res.status(200).json({ success: true });
      }

      // Action pour AJOUTER un élève (Manuel ou CSV)
      if (firstName && lastName) {
        await sql`
          INSERT INTO "Student" (id, "firstName", "lastName", grade)
          VALUES (gen_random_uuid(), ${firstName}, ${lastName}, ${grade})
        `;
        return res.status(200).json({ success: true });
      }

      // Action par défaut : UPSERT une note (Result)
      await sql`
        INSERT INTO "Result" ("studentId", "competenceId", "score", "isStarted", "updatedAt")
        VALUES (${studentId}, ${parseInt(competenceId)}, ${score}, ${isStarted}, NOW())
        ON CONFLICT ("studentId", "competenceId") DO UPDATE SET
          "score" = EXCLUDED."score",
          "isStarted" = EXCLUDED."isStarted",
          "updatedAt" = NOW()
      `;
      return res.status(200).json({ success: true });

    } catch (error: any) {
      console.error("Erreur API:", error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
}