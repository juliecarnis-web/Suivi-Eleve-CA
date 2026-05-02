/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import Papa from 'papaparse';
import { neon } from '@neondatabase/serverless';
import { Loader2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utility Functions ---
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Neon DB Setup ---
const NEON_URL = 'postgresql://neondb_owner:npg_H02jNElaQogn@ep-cold-truth-aljkhk6v.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require';
const sql = neon(NEON_URL);

// --- Types ---
export type Student = {
  id: string;
  firstName: string;
  lastName: string;
  grade: string;
};

export type Competence = {
  id: string;
  domain: string;
  subDomain: string;
  title: string;
};

export type Result = {
  studentId: string;
  competenceId: string;
  successCount: number;
  isTaught: boolean;
};

export type ResultsMap = Record<string, Record<string, Result>>;

// --- Hook: useTrackingData ---
function useTrackingData() {
  const [students, setStudents] = useState<Student[]>([]);
  const [competences, setCompetences] = useState<Competence[]>([]);
  const [results, setResults] = useState<ResultsMap>({});
  const [loading, setLoading] = useState(true);

  const initTables = useCallback(async () => {
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS "Student" (
          id UUID PRIMARY KEY,
          "firstName" TEXT NOT NULL,
          "lastName" TEXT NOT NULL,
          grade TEXT NOT NULL
        );
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS "Competence" (
          id TEXT PRIMARY KEY,
          domain TEXT NOT NULL,
          "subDomain" TEXT NOT NULL,
          title TEXT NOT NULL
        );
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS "Result" (
          "studentId" UUID REFERENCES "Student"(id),
          "competenceId" TEXT REFERENCES "Competence"(id),
          "score" INTEGER NOT NULL DEFAULT 0 CHECK ("score" >= 0 AND "score" <= 10),
          "isStarted" BOOLEAN NOT NULL DEFAULT FALSE,
          "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          PRIMARY KEY ("studentId", "competenceId")
        );
      `;
    } catch (e) {
      console.error('Erreur initialisation tables:', e);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      await initTables();
      const studentsData = await sql`SELECT * FROM "Student"`;
      const competencesData = await sql`SELECT * FROM "Competence"`;
      const resultsData = await sql`SELECT * FROM "Result"`;

      const resultsMapLocal: ResultsMap = {};
      resultsData.forEach(r => {
        const sId = r.studentId as string;
        const cId = r.competenceId as string;
        if (!resultsMapLocal[sId]) resultsMapLocal[sId] = {};
        resultsMapLocal[sId][cId] = {
          studentId: sId,
          competenceId: cId,
          successCount: r.score as number,
          isTaught: r.isStarted as boolean
        };
      });

      setStudents(studentsData as Student[]);
      setCompetences(competencesData as Competence[]);
      setResults(resultsMapLocal);
    } catch (e) {
      console.error('Erreur chargement données:', e);
    } finally {
      setLoading(false);
    }
  }, [initTables]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const upsertResult = useCallback(async (
    studentId: string,
    competenceId: string,
    updates: Partial<Pick<Result, 'successCount' | 'isTaught'>>
  ) => {
    setResults((prev) => {
      const next = { ...prev };
      const currentStudent = next[studentId] || {};
      const current = currentStudent[competenceId] || { studentId, competenceId, successCount: 0, isTaught: false };
      next[studentId] = { ...currentStudent, [competenceId]: { ...current, ...updates } };
      return next;
    });

    try {
      const sCount = updates.successCount !== undefined ? updates.successCount : 0;
      const taught = updates.isTaught !== undefined ? updates.isTaught : false;

      // Note: On utilise ici le nom exact de ton fichier api/upsert-result.ts
      await fetch('/api/upsert-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          competenceId,
          score: sCount,
          isStarted: taught
        })
      });
    } catch (error) {
      console.error("Erreur sauvegarde via API:", error);
    }
  }, []);

  const importStudents = useCallback(async (imported: Student[]) => {
    try {
      setLoading(true);
      for (const s of imported) {
        await sql`
          INSERT INTO "Student" (id, "firstName", "lastName", grade)
          VALUES (${s.id}, ${s.firstName}, ${s.lastName}, ${s.grade})
          ON CONFLICT (id) DO UPDATE SET
            "firstName" = EXCLUDED."firstName",
            "lastName" = EXCLUDED."lastName",
            grade = EXCLUDED.grade
        `;
      }
      await fetchData();
    } catch (e) {
      console.error("Erreur import élèves:", e);
      setLoading(false);
    }
  }, [fetchData]);

  const importCompetences = useCallback(async (imported: Competence[]) => {
    try {
      setLoading(true);
      for (const c of imported) {
        await sql`
          INSERT INTO "Competence" (id, domain, "subDomain", title)
          VALUES (${c.id}, ${c.domain}, ${c.subDomain}, ${c.title})
          ON CONFLICT (id) DO UPDATE SET
            domain = EXCLUDED.domain,
            "subDomain" = EXCLUDED."subDomain",
            title = EXCLUDED.title
        `;
      }
      await fetchData();
    } catch (e) {
      console.error("Erreur import compétences:", e);
      setLoading(false);
    }
  }, [fetchData]);

  return { students, competences, results, loading, upsertResult, importStudents, importCompetences };
}

// --- Component: CSVImport ---
function CSVImport({ onImportStudents, onImportCompetences }: { onImportStudents: (data: any[]) => void, onImportCompetences: (data: any[]) => void }) {
  const studentsRef = useRef<HTMLInputElement>(null);
  const competencesRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'students' | 'competences') => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (type === 'students') {
          const mapped = results.data.map((row: any) => ({
            id: row.id || crypto.randomUUID(),
            firstName: row.firstName || row.prenom || '',
            lastName: row.lastName || row.nom || '',
            grade: row.grade || row.niveau || '',
          }));
          onImportStudents(mapped);
        } else {
          const mapped = results.data.map((row: any, i: number) => ({
            id: row.id || `csv_c_${i}_${Date.now()}`,
            domain: row.domain || row.domaine || '',
            subDomain: row.subDomain || row.sousDomaine || '',
            title: row.title || row.titre || row.intitule || '',
          }));
          onImportCompetences(mapped);
        }
      },
    });
  };

  return (
    <div className="flex items-center gap-2">
      <button onClick={() => studentsRef.current?.click()} className="px-3 py-1.5 border border-slate-200 bg-white text-xs font-medium rounded hover:bg-slate-50">
        Import Élèves
      </button>
      <input type="file" ref={studentsRef} accept=".csv" className="hidden" onChange={(e) => handleFileUpload(e, 'students')} />

      <button onClick={() => competencesRef.current?.click()} className="px-3 py-1.5 border border-slate-200 bg-white text-xs font-medium rounded hover:bg-slate-50">
        Import Compétences
      </button>
      <input type="file" ref={competencesRef} accept=".csv" className="hidden" onChange={(e) => handleFileUpload(e, 'competences')} />
    </div>
  );
}

// --- Component: SaisieView ---
function SaisieView({ students, competences, results, onUpsert }: { students: Student[], competences: Competence[], results: ResultsMap, onUpsert: any }) {
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const rowsScrollRefs = useRef<(HTMLDivElement | null)[]>([]);

  const handleScroll = (scrollLeft: number) => {
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = scrollLeft;
    rowsScrollRefs.current.forEach((ref) => { if (ref) ref.scrollLeft = scrollLeft; });
  };

  const getStatusText = (successCount: number) => {
    if (successCount < 3) return ' (NA)';
    if (successCount <= 4) return ' (PA)';
    return ' (A)';
  };

  const getStatusColorClass = (successCount: number, isTaught: boolean) => {
    if (!isTaught) return 'bg-slate-100';
    if (successCount < 3) return 'bg-rose-50';
    if (successCount <= 4) return 'bg-amber-50';
    return 'bg-emerald-50';
  };

  const getStatusTextColorClass = (successCount: number) => {
    if (successCount < 3) return 'text-rose-700';
    if (successCount <= 4) return 'text-amber-700';
    return 'text-emerald-700';
  };

  return (
    <main className="flex-1 bg-slate-100 relative overflow-hidden flex">
      <div className="absolute inset-0 flex flex-col">
        <div className="flex bg-slate-200 border-b border-slate-300 pointer-events-auto">
          <div className="w-48 bg-slate-300 p-3 flex-shrink-0 font-bold text-[11px] text-slate-700 border-r border-slate-400 flex items-center">
            LISTE DES ÉLÈVES
          </div>
          <div className="flex-1 flex overflow-x-auto no-scrollbar pointer-events-auto" ref={headerScrollRef} onScroll={(e) => handleScroll((e.target as HTMLDivElement).scrollLeft)}>
            {competences.map((comp) => (
              <div key={comp.id} className="flex-shrink-0 w-32 border-r border-slate-300 p-2 text-center flex flex-col justify-center">
                <p className="text-[8px] text-slate-500 font-bold uppercase truncate" title={comp.domain}>{comp.domain}</p>
                <p className="text-[10px] font-medium leading-tight" title={comp.title}>{comp.title.length > 25 ? comp.title.substring(0, 25) + '...' : comp.title}</p>
              </div>
            ))}
          </div>
        </div>

       <div className="flex-1 flex flex-col overflow-y-auto pb-8">
        {students.map((student, rowIndex) => (
            <div key={student.id} className="flex border-b border-slate-200 bg-white group hover:bg-slate-50">
              <div className="w-48 p-3 border-r border-slate-300 flex-shrink-0 font-medium text-xs flex items-center shadow-right z-10 relative">
                <span className="truncate" title={`${student.lastName.toUpperCase()} ${student.firstName} (${student.grade})`}>
                  {student.lastName.toUpperCase()} {student.firstName} <span className="text-slate-400 font-normal">({student.grade})</span>
                </span>
              </div>
              <div className="flex-1 flex overflow-x-auto no-scrollbar" ref={el => rowsScrollRefs.current[rowIndex] = el} onScroll={(e) => handleScroll((e.target as HTMLDivElement).scrollLeft)}>
                {competences.map((comp) => {
                  const result = results[student.id]?.[comp.id] || { successCount: 0, isTaught: false };
                  const isTaught = result.isTaught;
                  const successCount = result.successCount;

                  return (
                    <div key={comp.id} className={cn("flex-shrink-0 w-32 border-r border-slate-200 p-1 flex flex-col items-center justify-center transition-colors", getStatusColorClass(successCount, isTaught))}>
                      {isTaught ? (
                        <>
                          <span className={cn("text-[9px] font-bold", getStatusTextColorClass(successCount))}>
                            {successCount}/10 {getStatusText(successCount)}
                          </span>
                          <div className="flex gap-1 mt-1">
                            <button onClick={() => onUpsert(student.id, comp.id, { successCount: Math.max(0, successCount - 1), isTaught: true })} disabled={successCount <= 0} className="w-5 h-5 bg-white border border-slate-200 rounded flex items-center justify-center text-[10px] hover:bg-slate-100 disabled:opacity-50 cursor-pointer">-</button>
                            <button onClick={() => onUpsert(student.id, comp.id, { successCount: Math.min(10, successCount + 1), isTaught: true })} disabled={successCount >= 10} className="w-5 h-5 bg-white border border-slate-200 rounded flex items-center justify-center text-[10px] hover:bg-slate-100 disabled:opacity-50 cursor-pointer">+</button>
                          </div>
                          <div className="mt-1 flex gap-1 items-center">
                            <input type="checkbox" checked={isTaught} onChange={(e) => onUpsert(student.id, comp.id, { isTaught: e.target.checked, successCount })} className="w-2.5 h-2.5 accent-indigo-600 rounded cursor-pointer" title="Désactiver cette notion" />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-6 h-3 bg-slate-300 rounded-full relative cursor-pointer" onClick={() => onUpsert(student.id, comp.id, { isTaught: true, successCount })}>
                            <div className="w-2 h-2 bg-white rounded-full absolute top-0.5 left-0.5 shadow-sm"></div>
                          </div>
                          <span className="text-[8px] mt-1 text-slate-400">Non-ens.</span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {students.length > 0 && (
            <div className="mt-auto bg-white border-t border-slate-300 p-2 flex items-center justify-between sticky bottom-0 z-10 w-full">
              <p className="text-[10px] text-slate-500">Affichage : {students.length} élèves</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// --- Main App Component ---
export default function App() {
  const { students, competences, results, loading, upsertResult, importStudents, importCompetences } = useTrackingData();
  const [activeTab, setActiveTab] = useState<'saisie' | 'pilotage'>('saisie');

  const { overallAverage, validRate, activeCompetencesCount } = useMemo(() => {
    let totalScore = 0;
    let scoresCount = 0;
    let validScoresCount = 0;
    const activeComps = new Set<string>();

    students.forEach(student => {
      competences.forEach(comp => {
        const res = results[student.id]?.[comp.id];
        if (res && res.isTaught) {
          totalScore += res.successCount;
          scoresCount++;
          if (res.successCount >= 5) validScoresCount++;
          activeComps.add(comp.id);
        }
      });
    });

    return {
      overallAverage: scoresCount > 0 ? (totalScore / scoresCount).toFixed(1) : '0.0',
      validRate: scoresCount > 0 ? Math.round((validScoresCount / scoresCount) * 100) : 0,
      activeCompetencesCount: activeComps.size,
    };
  }, [students, competences, results]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-slate-500 font-medium">Connexion à Neon PostgreSQL en cours...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden">
      <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 shadow-sm shrink-0 z-10">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight uppercase">Suivi Pédagogique</h1>
            <p className="text-[10px] text-slate-400">Neon DB: Connected • Temps Réel</p>
          </div>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-md">
          <button onClick={() => setActiveTab('saisie')} className={cn("px-4 py-1.5 text-xs font-semibold rounded shadow-sm transition-colors", activeTab === 'saisie' ? "bg-white text-indigo-600" : "text-slate-500 hover:text-slate-700 font-medium bg-transparent shadow-none")}>
            Mode Saisie
          </button>
          <button onClick={() => setActiveTab('pilotage')} className={cn("px-4 py-1.5 text-xs font-semibold rounded shadow-sm transition-colors", activeTab === 'pilotage' ? "bg-white text-indigo-600" : "text-slate-500 hover:text-slate-700 font-medium bg-transparent shadow-none")}>
            Pilotage
          </button>
        </div>

        <div className="flex items-center gap-2">
          <CSVImport onImportStudents={importStudents} onImportCompetences={importCompetences} />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 border-r border-slate-200 bg-white flex flex-col shrink-0">
          <div className="p-4 border-b border-slate-100">
            <input type="text" placeholder="Rechercher un élève..." className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div className="flex-1 p-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Indicateurs de Pilotage</h3>
            <div className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <p className="text-[10px] text-slate-500 mb-1">Moyenne Générale (Activé)</p>
                <p className="text-2xl font-bold text-slate-900">{overallAverage}<span className="text-sm text-slate-400 font-normal ml-1">/10</span></p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <p className="text-[10px] text-slate-500 mb-1">Taux de Validation (A)</p>
                <p className="text-2xl font-bold text-slate-900">{validRate}<span className="text-sm text-slate-400 font-normal ml-1">%</span></p>
              </div>
            </div>
          </div>
        </aside>

        {activeTab === 'saisie' ? (
          <SaisieView students={students} competences={competences} results={results} onUpsert={upsertResult} />
        ) : (
          <div className="flex-1 p-8 overflow-auto bg-slate-100">
            <div className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold tracking-tight mb-2">Pilotage : Analyses des compétences</h2>
              <p className="text-sm text-slate-500 mb-6">Moyennes de réussite sur les notions actives</p>
              {activeCompetencesCount === 0 ? (
                <p className="text-center text-slate-500 py-12">Aucune donnée à afficher. Activez des notions.</p>
              ) : (
                <div className="space-y-4">
                  {competences.map(comp => {
                    let total = 0, count = 0;
                    students.forEach(s => {
                      if (results[s.id]?.[comp.id]?.isTaught) {
                        total += results[s.id][comp.id].successCount;
                        count++;
                      }
                    });
                    if (count === 0) return null;
                    const avg = total / count;
                    return (
                      <div key={comp.id} className="flex flex-col gap-1">
                        <div className="flex justify-between text-xs font-medium">
                          <span>{comp.domain} › {comp.title}</span>
                          <span className={avg >= 5 ? 'text-emerald-600' : 'text-rose-600'}>{avg.toFixed(1)}/10</span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div className={cn("h-full", avg >= 5 ? "bg-emerald-500" : "bg-rose-500")} style={{ width: `${(avg / 10) * 100}%` }}></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-4 right-4 bg-slate-900 text-white px-3 py-2 rounded-full text-[10px] font-bold shadow-xl flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
        Mise à jour Neon PostgreSQL (Temps Réel)
      </div>
    </div>
  );
}