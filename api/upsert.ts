import { neon } from '@neondatabase/serverless';

let tablesInitialized = false;

async function ensureTables(sql: ReturnType<typeof neon>) {
  if (tablesInitialized) return;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS "Student" (
        "id" text PRIMARY KEY,
        "firstName" text NOT NULL,
        "lastName" text NOT NULL,
        "grade" text NOT NULL,
        "level" text,
        "isArchived" boolean DEFAULT false NOT NULL,
        "teacher_id" varchar(100) DEFAULT 'JulieCB' NOT NULL
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS "Competence" (
        "id" serial PRIMARY KEY,
        "code" text NOT NULL,
        "domain" text NOT NULL,
        "subDomain" text,
        "title" text NOT NULL,
        "grade" text NOT NULL,
        "isStarted" boolean DEFAULT false,
        "url" text,
        "teacher_id" varchar(100) DEFAULT 'JulieCB' NOT NULL
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS "Result" (
        "id" serial PRIMARY KEY,
        "studentId" text NOT NULL,
        "competenceId" integer NOT NULL,
        "score" integer DEFAULT 0,
        "isStarted" boolean DEFAULT false,
        "updatedAt" timestamp with time zone DEFAULT now(),
        "teacher_id" varchar(100) DEFAULT 'JulieCB' NOT NULL,
        CONSTRAINT "unique_student_competence" UNIQUE("studentId","competenceId")
      );
    `;
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
    await sql`
      CREATE TABLE IF NOT EXISTS observations (
        id SERIAL PRIMARY KEY,
        student_id TEXT NOT NULL UNIQUE,
        content TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS "Fluence" (
        "id" text PRIMARY KEY,
        "studentId" text NOT NULL,
        "date" timestamp with time zone DEFAULT now(),
        "score" integer NOT NULL,
        "errors_count" integer DEFAULT 0,
        "period" integer NOT NULL,
        "text_title" text,
        "teacher_id" varchar(100) DEFAULT 'JulieCB' NOT NULL,
        CONSTRAINT "unique_student_period" UNIQUE("studentId", "period")
      );
    `;
    await sql`ALTER TABLE "Fluence" ADD COLUMN IF NOT EXISTS "period" integer DEFAULT 1`;
    await sql`ALTER TABLE "Fluence" ADD COLUMN IF NOT EXISTS "checkPoint" integer DEFAULT 1`;
    await sql`ALTER TABLE "Fluence" ADD COLUMN IF NOT EXISTS "studentId" text`;
    await sql`ALTER TABLE "Fluence" ADD COLUMN IF NOT EXISTS "score" integer DEFAULT 0`;
    await sql`ALTER TABLE "Fluence" ADD COLUMN IF NOT EXISTS "errors_count" integer DEFAULT 0`;
    await sql`ALTER TABLE "Fluence" ADD COLUMN IF NOT EXISTS "text_title" text`;
    await sql`ALTER TABLE "Fluence" ADD COLUMN IF NOT EXISTS "teacher_id" varchar(100) DEFAULT 'JulieCB'`;
    await sql`ALTER TABLE "Fluence" ADD COLUMN IF NOT EXISTS "date" timestamp with time zone DEFAULT now()`;
    try {
      await sql`ALTER TABLE "Fluence" ALTER COLUMN "checkPoint" DROP NOT NULL`;
    } catch (e) {
      // Ignorer si la colonne n'existait pas ou si l'altération n'est pas supportée
    }

    await sql`
      CREATE TABLE IF NOT EXISTS "FluenceReference" (
        "id" text PRIMARY KEY,
        "grade" text NOT NULL,
        "period" integer NOT NULL,
        "target_score" integer NOT NULL,
        "teacher_id" varchar(100) DEFAULT 'JulieCB' NOT NULL,
        CONSTRAINT "unique_grade_period" UNIQUE("grade", "period")
      );
    `;
    await sql`ALTER TABLE "FluenceReference" ADD COLUMN IF NOT EXISTS "period" integer DEFAULT 1`;
    await sql`ALTER TABLE "FluenceReference" ADD COLUMN IF NOT EXISTS "grade" text`;
    await sql`ALTER TABLE "FluenceReference" ADD COLUMN IF NOT EXISTS "target_score" integer DEFAULT 50`;
    await sql`ALTER TABLE "FluenceReference" ADD COLUMN IF NOT EXISTS "teacher_id" varchar(100) DEFAULT 'JulieCB'`;

    // Seuils de référence par défaut si vides
    const refCheck = await sql`SELECT count(*)::int as count FROM "FluenceReference"`;
    if (refCheck[0]?.count === 0) {
      const defaultRefs = [
        { grade: 'CP', p1: 15, p2: 25, p3: 35, p4: 45, p5: 50 },
        { grade: 'CE1', p1: 50, p2: 60, p3: 70, p4: 80, p5: 90 },
        { grade: 'CE2', p1: 70, p2: 80, p3: 90, p4: 100, p5: 110 },
        { grade: 'CM1', p1: 90, p2: 100, p3: 110, p4: 120, p5: 130 },
        { grade: 'CM2', p1: 100, p2: 110, p3: 120, p4: 130, p5: 140 },
      ];
      for (const item of defaultRefs) {
        for (let p = 1; p <= 5; p++) {
          const scoreKey = `p${p}` as keyof typeof item;
          const targetScore = item[scoreKey] as number;
          const id = `${item.grade}_P${p}`;
          await sql`
            INSERT INTO "FluenceReference" ("id", "grade", "period", "target_score", "teacher_id")
            VALUES (${id}, ${item.grade}, ${p}, ${targetScore}, 'JulieCB')
            ON CONFLICT DO NOTHING
          `;
        }
      }
    }

    await sql`
      CREATE TABLE IF NOT EXISTS "CurriculumItem" (
        "id" serial PRIMARY KEY,
        "code" text NOT NULL,
        "domain" text NOT NULL,
        "subDomain" text,
        "title" text NOT NULL,
        "grade" text NOT NULL,
        "teacher_id" varchar(100) DEFAULT 'JulieCB' NOT NULL
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS "CurriculumResult" (
        "id" text PRIMARY KEY,
        "studentId" text NOT NULL,
        "curriculumId" integer NOT NULL,
        "evaluationNum" integer NOT NULL,
        "score" integer NOT NULL,
        "grade" text NOT NULL,
        "updatedAt" timestamp with time zone DEFAULT now(),
        "teacher_id" varchar(100) DEFAULT 'JulieCB' NOT NULL,
        CONSTRAINT "unique_student_curriculum_eval" UNIQUE("studentId", "curriculumId", "evaluationNum")
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS "APC" (
        "id" text PRIMARY KEY,
        "session_id" text NOT NULL,
        "session_date" date NOT NULL,
        "student_id" text NOT NULL,
        "competence_id" integer,
        "chapter_code" text NOT NULL,
        "chapter_title" text,
        "domain" text,
        "sub_domain" text,
        "focus_type" text DEFAULT 'competence' NOT NULL,
        "modality" text DEFAULT 'individuel' NOT NULL,
        "notes" text,
        "teacher_id" varchar(100) DEFAULT 'JulieCB' NOT NULL,
        "created_at" timestamp with time zone DEFAULT now()
      );
    `;
    await sql`ALTER TABLE "APC" ADD COLUMN IF NOT EXISTS "modality" text DEFAULT 'individuel'`;

    await sql`
      CREATE TABLE IF NOT EXISTS "ParentPriority" (
        "id" text PRIMARY KEY,
        "student_id" text NOT NULL,
        "competence_id" integer NOT NULL,
        "teacher_id" varchar(100) DEFAULT 'JulieCB' NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now(),
        CONSTRAINT "unique_parent_priority" UNIQUE("student_id", "competence_id")
      );
    `;

    tablesInitialized = true;
  } catch (err) {
    console.error("Erreur d'initialisation des tables:", err);
  }
}

export default async function handler(req: any, res: any) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return res.status(200).json({
      connected: false,
      message: "DATABASE_URL n'est pas encore configurée dans les secrets.",
      students: [],
      competences: [],
      resultsMap: {}
    });
  }

  const sql = neon(dbUrl);
  await ensureTables(sql);

  // --- LECTURE (GET) ---
  if (req.method === 'GET') {
    try {
      // 1. Chargement des données principales (Élèves, Compétences, Résultats)
      const students = await sql`SELECT * FROM "Student" ORDER BY "isArchived" ASC, "lastName" ASC`;
      const competences = await sql`SELECT * FROM "Competence" ORDER BY id ASC`;
      const resultsRaw = await sql`SELECT * FROM "Result"`;
      
      const resultsMap: Record<string, Record<number, any>> = {};
      resultsRaw.forEach((r: any) => {
        if (!resultsMap[r.studentId]) resultsMap[r.studentId] = {};
        resultsMap[r.studentId][r.competenceId] = r;
      });

      // 2. Chargement sécurisé des paramètres (user_settings sans exposer le mot de passe)
      let userSettings = null;
      try {
        const settings = await sql`SELECT * FROM "user_settings" LIMIT 1`;
        if (settings[0]) {
          const { password_hash, ...safeUserSettings } = settings[0];
          userSettings = safeUserSettings;
        }
      } catch (e) {
        console.warn("Table user_settings non lisible:", e);
      }

      // 3. Chargement sécurisé des données de Fluence
      let fluenceScores: any[] = [];
      try {
        const rawScores = await sql`SELECT * FROM "Fluence" ORDER BY COALESCE("period", "checkPoint", 1) ASC`;
        fluenceScores = rawScores.map((s: any) => ({
          ...s,
          studentId: s.studentId || s.studentid || s.student_id,
          period: s.period !== undefined && s.period !== null ? Number(s.period) : (s.checkPoint !== undefined && s.checkPoint !== null ? Number(s.checkPoint) : 1),
          checkPoint: s.checkPoint !== undefined && s.checkPoint !== null ? Number(s.checkPoint) : (s.period !== undefined && s.period !== null ? Number(s.period) : 1),
          score: s.score !== undefined && s.score !== null ? Number(s.score) : 0,
          errors_count: s.errors_count !== undefined && s.errors_count !== null ? Number(s.errors_count) : (s.errorscount || 0),
          text_title: s.text_title || s.texttitle || ''
        }));
      } catch (e) {
        console.warn("Table Fluence non lisible:", e);
      }

      let fluenceReferences: any[] = [];
      try {
        const rawRefs = await sql`SELECT * FROM "FluenceReference" ORDER BY "grade" ASC, COALESCE("period", 1) ASC`;
        fluenceReferences = rawRefs.map((r: any) => ({
          ...r,
          grade: r.grade || 'CP',
          period: r.period !== undefined && r.period !== null ? Number(r.period) : 1,
          target_score: r.target_score !== undefined && r.target_score !== null ? Number(r.target_score) : (r.targetscore || 50)
        }));
      } catch (e) {
        console.warn("Table FluenceReference non lisible:", e);
      }

      let curriculumItems: any[] = [];
      try {
        curriculumItems = await sql`SELECT * FROM "CurriculumItem" ORDER BY id ASC`;
      } catch (e) {
        console.warn("Table CurriculumItem non lisible:", e);
      }

      let curriculumResults: any[] = [];
      try {
        const rawCurrRes = await sql`SELECT * FROM "CurriculumResult"`;
        curriculumResults = rawCurrRes.map((r: any) => ({
          ...r,
          curriculumId: Number(r.curriculumId),
          evaluationNum: Number(r.evaluationNum),
          score: Number(r.score)
        }));
      } catch (e) {
        console.warn("Table CurriculumResult non lisible:", e);
      }

      let apcEntries: any[] = [];
      try {
        const rawApc = await sql`
          SELECT
            "id",
            "session_id",
            TO_CHAR("session_date", 'YYYY-MM-DD') as "session_date",
            "student_id",
            "competence_id",
            "chapter_code",
            "chapter_title",
            "domain",
            "sub_domain",
            "focus_type",
            COALESCE("modality", 'individuel') as "modality",
            "notes",
            "created_at"
          FROM "APC"
          WHERE "teacher_id" = 'JulieCB'
          ORDER BY "session_date" DESC, "created_at" DESC
        `;
        apcEntries = rawApc.map((r: any) => ({
          ...r,
          competence_id: r.competence_id !== null && r.competence_id !== undefined ? Number(r.competence_id) : null,
          modality: r.modality === 'autonomie' ? 'autonomie' : 'individuel'
        }));
      } catch (e) {
        console.warn("Table APC non lisible:", e);
      }

      let parentPriorities: any[] = [];
      try {
        const rawPriorities = await sql`
          SELECT "id", "student_id", "competence_id", "updated_at"
          FROM "ParentPriority"
          WHERE "teacher_id" = 'JulieCB'
          ORDER BY "updated_at" DESC
        `;
        parentPriorities = rawPriorities.map((r: any) => ({
          ...r,
          competence_id: Number(r.competence_id)
        }));
      } catch (e) {
        console.warn("Table ParentPriority non lisible:", e);
      }

      return res.status(200).json({
        connected: true,
        students,
        competences,
        resultsMap,
        userSettings,
        fluenceScores,
        fluenceReferences,
        curriculumItems,
        curriculumResults,
        apcEntries,
        parentPriorities
      });
    } catch (error: any) {
      console.error("Erreur globale lors de la lecture des données:", error);
      return res.status(500).json({ connected: false, error: error.message });
    }
  }

  // --- ÉCRITURE (POST) ---
  if (req.method === 'POST') {
    const body = req.body;

    try {
      if (body.action === 'clear') {
        if (body.table === 'Result') await sql`DELETE FROM "Result" WHERE "teacher_id" = 'JulieCB'`;
        if (body.table === 'Student') await sql`DELETE FROM "Student" WHERE "teacher_id" = 'JulieCB'`;
        if (body.table === 'Competence') await sql`DELETE FROM "Competence" WHERE "teacher_id" = 'JulieCB'`;
        if (body.table === 'Observations') await sql`TRUNCATE TABLE observations RESTART IDENTITY CASCADE`;
        if (body.table === 'Fluence') await sql`DELETE FROM "Fluence" WHERE "teacher_id" = 'JulieCB'`;
        if (body.table === 'FluenceReference') await sql`DELETE FROM "FluenceReference" WHERE "teacher_id" = 'JulieCB'`;
        if (body.table === 'CurriculumItem') await sql`DELETE FROM "CurriculumItem" WHERE "teacher_id" = 'JulieCB'`;
        if (body.table === 'CurriculumResult') await sql`DELETE FROM "CurriculumResult" WHERE "teacher_id" = 'JulieCB'`;
        if (body.table === 'APC') await sql`DELETE FROM "APC" WHERE "teacher_id" = 'JulieCB'`;
        if (body.table === 'ParentPriority') await sql`DELETE FROM "ParentPriority" WHERE "teacher_id" = 'JulieCB'`;
        return res.status(200).json({ success: true });
      }

      if (body.type === 'student_bulk') {
        const rows = body.data;
        for(let row of rows) {
          const idVal = row.id || (globalThis.crypto ? globalThis.crypto.randomUUID() : `st_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
          await sql`
            INSERT INTO "Student" (id, "firstName", "lastName", grade, "isArchived", teacher_id)
            VALUES (${idVal}, ${row.firstName}, ${row.lastName}, ${row.grade}, false, 'JulieCB')
            ON CONFLICT (id) DO UPDATE SET
              "firstName" = EXCLUDED."firstName",
              "lastName" = EXCLUDED."lastName",
              "grade" = EXCLUDED."grade"
          `;
        }
        return res.status(200).json({ success: true });
      }

      if (body.type === 'student') {
        const idVal = body.id || (globalThis.crypto ? globalThis.crypto.randomUUID() : `st_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
        await sql`
          INSERT INTO "Student" (id, "firstName", "lastName", grade, "isArchived", teacher_id)
          VALUES (${idVal}, ${body.firstName}, ${body.lastName}, ${body.grade}, false, 'JulieCB')
          ON CONFLICT (id) DO UPDATE SET
            "firstName" = EXCLUDED."firstName",
            "lastName" = EXCLUDED."lastName",
            "grade" = EXCLUDED."grade"
        `;
        return res.status(200).json({ success: true });
      }

      if (body.type === 'student_archive') {
        await sql`UPDATE "Student" SET "isArchived" = ${body.isArchived} WHERE id = ${body.id}`;
        return res.status(200).json({ success: true });
      }

      if (body.type === 'competence_bulk') {
        const rows = body.data;
        for(let row of rows) {
          await sql`
            INSERT INTO "Competence" (code, domain, "subDomain", title, grade, "isStarted", teacher_id)
            VALUES (${row.code}, ${row.domain}, ${row.subDomain}, ${row.title}, ${row.grade}, false, 'JulieCB')
            ON CONFLICT DO NOTHING
          `;
        }
        return res.status(200).json({ success: true });
      }

      if (body.type === 'result') {
        const parsedScore =
          body.score === null || body.score === undefined || body.score === ''
            ? null
            : parseInt(body.score, 10);
        await sql`
          INSERT INTO "Result" ("studentId", "competenceId", "score", "isStarted", "updatedAt", teacher_id)
          VALUES (${body.studentId}, ${parseInt(body.competenceId, 10)}, ${parsedScore}, ${Boolean(body.isStarted)}, NOW(), 'JulieCB')
          ON CONFLICT ("studentId", "competenceId") DO UPDATE SET
            "score" = EXCLUDED."score",
            "isStarted" = EXCLUDED."isStarted",
            "updatedAt" = NOW()
        `;
        return res.status(200).json({ success: true });
      }

      if (body.type === 'result_bulk_ne') {
        const competenceIds: number[] = Array.isArray(body.competenceIds)
          ? body.competenceIds.map((id: any) => parseInt(id, 10)).filter((id: number) => !isNaN(id))
          : [];
        const studentIds: string[] = Array.isArray(body.studentIds)
          ? body.studentIds.map((id: any) => String(id))
          : [];

        if (competenceIds.length > 0 && studentIds.length > 0) {
          for (const compId of competenceIds) {
            for (const stId of studentIds) {
              await sql`
                INSERT INTO "Result" ("studentId", "competenceId", "score", "isStarted", "updatedAt", teacher_id)
                VALUES (${stId}, ${compId}, ${null}, true, NOW(), 'JulieCB')
                ON CONFLICT ("studentId", "competenceId") DO UPDATE SET
                  "score" = NULL,
                  "isStarted" = true,
                  "updatedAt" = NOW()
              `;
            }
          }
        } else if (competenceIds.length > 0) {
          for (const compId of competenceIds) {
            await sql`
              UPDATE "Result"
              SET "score" = NULL, "isStarted" = true, "updatedAt" = NOW()
              WHERE "competenceId" = ${compId} AND "teacher_id" = 'JulieCB'
            `;
          }
        }
        return res.status(200).json({ success: true });
      }

      if (body.type === 'result_bulk_start') {
        const competenceIds: number[] = Array.isArray(body.competenceIds)
          ? body.competenceIds.map((id: any) => parseInt(id, 10)).filter((id: number) => !isNaN(id))
          : [];
        const studentIds: string[] = Array.isArray(body.studentIds)
          ? body.studentIds.map((id: any) => String(id))
          : [];
        const isStarted = Boolean(body.isStarted);

        for (const compId of competenceIds) {
          for (const stId of studentIds) {
            await sql`
              INSERT INTO "Result" ("studentId", "competenceId", "score", "isStarted", "updatedAt", teacher_id)
              VALUES (${stId}, ${compId}, ${null}, ${isStarted}, NOW(), 'JulieCB')
              ON CONFLICT ("studentId", "competenceId") DO UPDATE SET
                "isStarted" = EXCLUDED."isStarted",
                "updatedAt" = NOW()
            `;
          }
        }
        return res.status(200).json({ success: true });
      }

      if (body.type === 'observation_fetch' || body.action === 'get_observation') {
        const obs = await sql`
          SELECT content FROM observations 
          WHERE student_id = ${body.studentId}
        `;
        const content = obs.length > 0 ? obs[0].content : '';
        return res.status(200).json({ content });
      }

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

      if (body.type === 'fluence_upsert' || body.type === 'fluence_score_upsert') {
        const studentId = body.studentId || body.studentid || body.student_id;
        const period = parseInt(body.period, 10) || 1;
        const checkPoint = parseInt(body.checkPoint ?? body.check_point ?? period, 10) || period;
        const rawScore = body.score;
        const isNullOrEmpty = rawScore === null || rawScore === undefined || rawScore === '' || rawScore === 'null';

        await sql`DELETE FROM "Fluence" WHERE "studentId" = ${studentId} AND ("period" = ${period} OR "checkPoint" = ${checkPoint})`;

        if (!isNullOrEmpty && !isNaN(parseInt(rawScore, 10))) {
          const score = parseInt(rawScore, 10);
          const errors_count = parseInt(body.errors_count ?? body.errorsCount ?? 0, 10);
          const text_title = body.text_title || body.textTitle || '';
          const idVal = body.id || `fl_${studentId}_P${period}`;

          await sql`
            INSERT INTO "Fluence" ("id", "studentId", "date", "score", "errors_count", "period", "checkPoint", "text_title", "teacher_id")
            VALUES (${idVal}, ${studentId}, NOW(), ${score}, ${errors_count}, ${period}, ${checkPoint}, ${text_title}, 'JulieCB')
          `;
        }
        return res.status(200).json({ success: true });
      }

      if (body.type === 'fluence_bulk_upsert') {
        const items = body.data || [];
        for (const item of items) {
          const studentId = item.studentId || item.studentid || item.student_id;
          if (studentId) {
            const period = parseInt(item.period, 10) || 1;
            const checkPoint = parseInt(item.checkPoint ?? item.check_point ?? period, 10) || period;
            const rawScore = item.score;
            const isNullOrEmpty = rawScore === null || rawScore === undefined || rawScore === '' || rawScore === 'null';

            await sql`DELETE FROM "Fluence" WHERE "studentId" = ${studentId} AND ("period" = ${period} OR "checkPoint" = ${checkPoint})`;

            if (!isNullOrEmpty && !isNaN(parseInt(rawScore, 10))) {
              const score = parseInt(rawScore, 10);
              const errors_count = parseInt(item.errors_count ?? item.errorsCount ?? 0, 10);
              const text_title = item.text_title || item.textTitle || '';
              const idVal = item.id || `fl_${studentId}_P${period}`;

              await sql`
                INSERT INTO "Fluence" ("id", "studentId", "date", "score", "errors_count", "period", "checkPoint", "text_title", "teacher_id")
                VALUES (${idVal}, ${studentId}, NOW(), ${score}, ${errors_count}, ${period}, ${checkPoint}, ${text_title}, 'JulieCB')
              `;
            }
          }
        }
        return res.status(200).json({ success: true });
      }

      if (body.type === 'fluence_reference_upsert') {
        const grade = body.grade || 'CP';
        const period = parseInt(body.period, 10) || 1;
        const target_score = parseInt(body.target_score ?? body.targetScore ?? 50, 10);
        const idVal = body.id || `${grade}_P${period}`;

        await sql`DELETE FROM "FluenceReference" WHERE "grade" = ${grade} AND "period" = ${period}`;
        await sql`
          INSERT INTO "FluenceReference" ("id", "grade", "period", "target_score", "teacher_id")
          VALUES (${idVal}, ${grade}, ${period}, ${target_score}, 'JulieCB')
        `;
        return res.status(200).json({ success: true });
      }

      if (body.type === 'fluence_reference_bulk_upsert') {
        const items = body.data || [];
        for (const item of items) {
          const grade = item.grade || 'CP';
          const period = parseInt(item.period, 10) || 1;
          const target_score = parseInt(item.target_score ?? item.targetScore ?? 50, 10);
          const idVal = item.id || `${grade}_P${period}`;

          await sql`DELETE FROM "FluenceReference" WHERE "grade" = ${grade} AND "period" = ${period}`;
          await sql`
            INSERT INTO "FluenceReference" ("id", "grade", "period", "target_score", "teacher_id")
            VALUES (${idVal}, ${grade}, ${period}, ${target_score}, 'JulieCB')
          `;
        }
        return res.status(200).json({ success: true });
      }

      if (body.type === 'curriculum_item_upsert') {
        if (body.id) {
          await sql`
            UPDATE "CurriculumItem"
            SET code = ${body.code}, domain = ${body.domain}, "subDomain" = ${body.subDomain || null}, title = ${body.title}, grade = ${body.grade}
            WHERE id = ${parseInt(body.id, 10)}
          `;
        } else {
          await sql`
            INSERT INTO "CurriculumItem" (code, domain, "subDomain", title, grade, teacher_id)
            VALUES (${body.code}, ${body.domain}, ${body.subDomain || null}, ${body.title}, ${body.grade}, 'JulieCB')
          `;
        }
        return res.status(200).json({ success: true });
      }

      if (body.type === 'curriculum_items_bulk_upsert') {
        const items = body.data || [];
        for (const item of items) {
          await sql`
            INSERT INTO "CurriculumItem" (code, domain, "subDomain", title, grade, teacher_id)
            VALUES (${item.code}, ${item.domain}, ${item.subDomain || null}, ${item.title}, ${item.grade}, 'JulieCB')
          `;
        }
        return res.status(200).json({ success: true });
      }

      if (body.type === 'curriculum_item_delete') {
        const itemId = parseInt(body.id, 10);
        await sql`DELETE FROM "CurriculumResult" WHERE "curriculumId" = ${itemId}`;
        await sql`DELETE FROM "CurriculumItem" WHERE id = ${itemId}`;
        return res.status(200).json({ success: true });
      }

      if (body.type === 'curriculum_result_upsert') {
        const { studentId, curriculumId, evaluationNum, score, grade } = body;
        const cId = parseInt(curriculumId, 10);
        const eNum = parseInt(evaluationNum, 10);
        const idVal = body.id || `curr_${studentId}_C${cId}_E${eNum}`;

        if (score === null || score === undefined || score === '' || score < 0) {
          await sql`DELETE FROM "CurriculumResult" WHERE "studentId" = ${studentId} AND "curriculumId" = ${cId} AND "evaluationNum" = ${eNum}`;
        } else {
          const sVal = parseInt(score, 10);
          await sql`
            INSERT INTO "CurriculumResult" ("id", "studentId", "curriculumId", "evaluationNum", "score", "grade", "updatedAt", "teacher_id")
            VALUES (${idVal}, ${studentId}, ${cId}, ${eNum}, ${sVal}, ${grade || ''}, NOW(), 'JulieCB')
            ON CONFLICT ("studentId", "curriculumId", "evaluationNum") DO UPDATE SET
              "score" = EXCLUDED."score",
              "grade" = EXCLUDED."grade",
              "updatedAt" = NOW()
          `;
        }
        return res.status(200).json({ success: true });
      }

      if (body.type === 'curriculum_result_bulk_upsert') {
        const items = body.data || [];
        for (const item of items) {
          const { studentId, curriculumId, evaluationNum, score, grade } = item;
          const cId = parseInt(curriculumId, 10);
          const eNum = parseInt(evaluationNum, 10);
          const idVal = item.id || `curr_${studentId}_C${cId}_E${eNum}`;

          if (score === null || score === undefined || score === '' || score < 0) {
            await sql`DELETE FROM "CurriculumResult" WHERE "studentId" = ${studentId} AND "curriculumId" = ${cId} AND "evaluationNum" = ${eNum}`;
          } else {
            const sVal = parseInt(score, 10);
            await sql`
              INSERT INTO "CurriculumResult" ("id", "studentId", "curriculumId", "evaluationNum", "score", "grade", "updatedAt", "teacher_id")
              VALUES (${idVal}, ${studentId}, ${cId}, ${eNum}, ${sVal}, ${grade || ''}, NOW(), 'JulieCB')
              ON CONFLICT ("studentId", "curriculumId", "evaluationNum") DO UPDATE SET
                "score" = EXCLUDED."score",
                "grade" = EXCLUDED."grade",
                "updatedAt" = NOW()
            `;
          }
        }
        return res.status(200).json({ success: true });
      }

      if (body.type === 'apc_session_save') {
        const sessionDate = typeof body.sessionDate === 'string' ? body.sessionDate.trim() : '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
          return res.status(400).json({ error: 'Date de séance invalide (YYYY-MM-DD attendu).' });
        }

        const rawEntries = Array.isArray(body.entries) ? body.entries : [];
        if (rawEntries.length === 0) {
          return res.status(400).json({ error: 'Aucune entrée élève fournie pour la séance APC.' });
        }

        const allowedFocus = new Set(['competence', 'theme', 'fluence', 'curriculum', 'custom']);
        const sessionId =
          typeof body.sessionId === 'string' && body.sessionId.trim()
            ? body.sessionId.trim().slice(0, 100)
            : `apc_${sessionDate}_${Date.now()}`;
        const sessionNotes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) : '';

        // Si mise à jour d'une session existante, on remplace proprement ses lignes
        await sql`DELETE FROM "APC" WHERE "session_id" = ${sessionId} AND "teacher_id" = 'JulieCB'`;

        const savedEntries: any[] = [];
        for (let idx = 0; idx < rawEntries.length; idx++) {
          const item = rawEntries[idx];
          const studentId = typeof item.studentId === 'string' ? item.studentId.trim() : '';
          const chapterCode = typeof item.chapterCode === 'string' ? item.chapterCode.trim().slice(0, 120) : '';
          if (!studentId || !chapterCode) continue;

          const parsedCompId =
            item.competenceId !== null && item.competenceId !== undefined && item.competenceId !== ''
              ? parseInt(item.competenceId, 10)
              : null;
          const competenceId = parsedCompId !== null && !isNaN(parsedCompId) ? parsedCompId : null;
          const chapterTitle = typeof item.chapterTitle === 'string' ? item.chapterTitle.trim().slice(0, 400) : '';
          const domain = typeof item.domain === 'string' ? item.domain.trim().slice(0, 200) : '';
          const subDomain = typeof item.subDomain === 'string' ? item.subDomain.trim().slice(0, 200) : '';
          const focusType = allowedFocus.has(item.focusType) ? item.focusType : 'competence';
          const modality = item.modality === 'autonomie' ? 'autonomie' : 'individuel';
          const entryNotes =
            typeof item.notes === 'string' && item.notes.trim()
              ? item.notes.trim().slice(0, 1000)
              : sessionNotes;
          const entryId =
            typeof item.id === 'string' && item.id.trim()
              ? item.id.trim().slice(0, 120)
              : `${sessionId}_${studentId}_${idx}`;

          await sql`
            INSERT INTO "APC" (
              "id", "session_id", "session_date", "student_id", "competence_id",
              "chapter_code", "chapter_title", "domain", "sub_domain",
              "focus_type", "modality", "notes", "teacher_id", "created_at"
            )
            VALUES (
              ${entryId}, ${sessionId}, ${sessionDate}::date, ${studentId}, ${competenceId},
              ${chapterCode}, ${chapterTitle}, ${domain}, ${subDomain},
              ${focusType}, ${modality}, ${entryNotes}, 'JulieCB', NOW()
            )
          `;

          savedEntries.push({
            id: entryId,
            session_id: sessionId,
            session_date: sessionDate,
            student_id: studentId,
            competence_id: competenceId,
            chapter_code: chapterCode,
            chapter_title: chapterTitle,
            domain,
            sub_domain: subDomain,
            focus_type: focusType,
            modality,
            notes: entryNotes
          });
        }

        return res.status(200).json({ success: true, sessionId, entries: savedEntries });
      }

      if (body.type === 'apc_session_delete') {
        const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
        if (!sessionId) {
          return res.status(400).json({ error: 'Identifiant de séance manquant.' });
        }
        await sql`DELETE FROM "APC" WHERE "session_id" = ${sessionId} AND "teacher_id" = 'JulieCB'`;
        return res.status(200).json({ success: true });
      }

      if (body.type === 'apc_entry_delete') {
        const entryId = typeof body.id === 'string' ? body.id.trim() : '';
        if (!entryId) {
          return res.status(400).json({ error: 'Identifiant d’entrée manquant.' });
        }
        await sql`DELETE FROM "APC" WHERE "id" = ${entryId} AND "teacher_id" = 'JulieCB'`;
        return res.status(200).json({ success: true });
      }

      if (body.type === 'parent_priority_save') {
        const studentId = typeof body.studentId === 'string' ? body.studentId.trim().slice(0, 120) : '';
        if (!studentId) {
          return res.status(400).json({ error: 'Identifiant élève manquant.' });
        }

        const rawIds = Array.isArray(body.competenceIds) ? body.competenceIds : [];
        const competenceIds: number[] = Array.from(
          new Set(
            rawIds
              .map((id: any) => parseInt(id, 10))
              .filter((id: number) => Number.isInteger(id) && id > 0)
          )
        ).slice(0, 50) as number[];

        await sql`
          DELETE FROM "ParentPriority"
          WHERE "student_id" = ${studentId} AND "teacher_id" = 'JulieCB'
        `;

        const savedEntries: any[] = [];
        for (const compId of competenceIds) {
          const entryId = `pp_${studentId}_${compId}`;
          await sql`
            INSERT INTO "ParentPriority" ("id", "student_id", "competence_id", "teacher_id", "updated_at")
            VALUES (${entryId}, ${studentId}, ${compId}, 'JulieCB', NOW())
          `;
          savedEntries.push({
            id: entryId,
            student_id: studentId,
            competence_id: compId
          });
        }

        return res.status(200).json({ success: true, studentId, entries: savedEntries });
      }

    } catch (error: any) {
      console.error("Erreur API détaillée:", error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
}
