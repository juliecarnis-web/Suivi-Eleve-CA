import { neon } from '@neondatabase/serverless';

export default async function handler(req: any, res: any) {
  const sql = neon(process.env.DATABASE_URL!);

  // --- LECTURE (GET) ---
  if (req.method === 'GET') {
    try {
      const students = await sql`SELECT * FROM "Student" ORDER BY "isArchived" ASC, "lastName" ASC`;
      
      // LA GREFFE EST ICI : On remplace "code" par id pour respecter l'ordre d'importation
      const competences = await sql`SELECT * FROM "Competence" ORDER BY id ASC`;
      
      const resultsRaw = await sql`SELECT * FROM "Result"`;
      
      const resultsMap: Record<string, Record<number, any>> = {};
      resultsRaw.forEach(r => {
        if (!resultsMap[r.studentId]) resultsMap[r.studentId] = {};
        resultsMap[r.studentId][r.competenceId] = r;
      });

      return res.status(200).json({ students, competences, resultsMap });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  // --- ÉCRITURE (POST) ---
  if (req.method === 'POST') {
    const body = req.body;

    try {
      // 1. VIDAGE DES TABLES (ADMIN)
      if (body.action === 'clear') {
        if (body.table === 'Result') await sql`TRUNCATE TABLE "Result" RESTART IDENTITY CASCADE`;
        if (body.table === 'Student') await sql`TRUNCATE TABLE "Student" CASCADE`;
        if (body.table === 'Competence') await sql`TRUNCATE TABLE "Competence" CASCADE`;
        if (body.table === 'Observations') await sql`TRUNCATE TABLE observations RESTART IDENTITY CASCADE`;
        return res.status(200).json({ success: true });
      }

      // 2. IMPORT BULK ÉLÈVES (CSV)
      if (body.type === 'student_bulk') {
        const rows = body.data;
        for(let row of rows) {
          await sql`
            INSERT INTO "Student" (id, "firstName", "lastName", grade, "isArchived")
            VALUES (gen_random_uuid(), ${row.firstName}, ${row.lastName}, ${row.grade}, false)
            ON CONFLICT DO NOTHING
          `;
        }
        return res.status(200).json({ success: true });
      }

      // 2 Bis. AJOUT MANUEL D'UN ÉLÈVE (FORMULAIRE)
      if (body.type === 'student') {
        await sql`
          INSERT INTO "Student" (id, "firstName", "lastName", grade, "isArchived")
          VALUES (gen_random_uuid(), ${body.firstName}, ${body.lastName}, ${body.grade}, false)
          ON CONFLICT DO NOTHING
        `;
        return res.status(200).json({ success: true });
      }

      // 3. ARCHIVAGE ÉLÈVE
      if (body.type === 'student_archive') {
        await sql`UPDATE "Student" SET "isArchived" = ${body.isArchived} WHERE id = ${body.id}`;
        return res.status(200).json({ success: true });
      }

      // 4. IMPORT BULK COMPÉTENCES (VERSION CORRIGÉE)
      if (body.type === 'competence_bulk') {
        const rows = body.data;
        console.log(`Tentative d'import de ${rows.length} compétences...`);
        
        for(let row of rows) {
          await sql`
            INSERT INTO "Competence" (code, domain, "subDomain", title, grade)
            VALUES (${row.code}, ${row.domain}, ${row.subDomain}, ${row.title}, ${row.grade})
            ON CONFLICT DO NOTHING
          `;
        }
        return res.status(200).json({ success: true });
      }

      // 5. UPSERT NOTE INDIVIDUELLE
      if (body.type === 'result') {
        await sql`
          INSERT INTO "Result" ("studentId", "competenceId", "score", "isStarted", "updatedAt")
          VALUES (${body.studentId}, ${parseInt(body.competenceId)}, ${body.score}, ${body.isStarted}, NOW())
          ON CONFLICT ("studentId", "competenceId") DO UPDATE SET
            "score" = EXCLUDED."score",
            "isStarted" = EXCLUDED."isStarted",
            "updatedAt" = NOW()
        `;
        return res.status(200).json({ success: true });
      }

      // 6. RECUPERER UNE OBSERVATION
      if (body.type === 'observation_fetch' || body.action === 'get_observation') {
        const obs = await sql`
          SELECT content FROM observations 
          WHERE student_id = ${body.studentId}
        `;
        const content = obs.length > 0 ? obs[0].content : '';
        return res.status(200).json({ content });
      }

      // 7. UPSERT OBSERVATION
      if (body.type === 'observation') {
        await sql`
          INSERT INTO observations (student_id, content, updated_at)
          VALUES (${body.studentId}, ${body.content}, NOW())
          ON CONFLICT (student_id) DO UPDATE SET
            content = EXCLUDED.content,
            updated_at = NOW()
        `;
        return res.status(200).json({ success: true });
      }

    } catch (error: any) {
      console.error("Erreur API détaillée:", error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
}
