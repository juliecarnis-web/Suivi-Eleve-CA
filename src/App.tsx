import React, { useState, useMemo, useCallback, useEffect } from 'react';
import Papa from 'papaparse';
import { Loader2, PlusCircle, Upload, Trash2, ShieldAlert, Power, UserX, BookOpen, BarChart2, Settings, Lock, Unlock } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, Legend, ReferenceLine, ResponsiveContainer, CartesianGrid } from 'recharts';

// --- Utility Functions ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function getScoreColor(score: number, isStarted: boolean) {
  if (!isStarted) return 'bg-slate-100 text-slate-400 border-slate-200';
  if (score >= 5) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (score >= 3 && score <= 4) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-rose-50 text-rose-700 border-rose-200';
}

// --- Types ---
type Student = {
  id: string;
  firstName: string;
  lastName: string;
  grade: string;
  isArchived: boolean;
};

type Competence = {
  id: number;
  code?: string;
  domain?: string;
  subDomain?: string;
  title: string;
  grade?: string;
};

type Result = {
  studentId: string;
  competenceId: number;
  score: number;
  isStarted: boolean;
};

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loginInput, setLoginInput] = useState('');
  const [isEditMode, setIsEditMode] = useState<boolean>(false);

  const [students, setStudents] = useState<Student[]>([]);
  const [competences, setCompetences] = useState<Competence[]>([]);
  // Map of studentId -> competenceId -> Result
  const [results, setResults] = useState<Record<string, Record<number, Result>>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'saisie' | 'pilotage' | 'admin'>('saisie');

  // Filters for Saisie
  const [filterGrade, setFilterGrade] = useState<string>('all');
  const [filterDomain, setFilterDomain] = useState<string>('all');
  const [filterSubDomain, setFilterSubDomain] = useState<string>('all');

  // Filters for Pilotage
  const [pilotFilterGrade, setPilotFilterGrade] = useState<string>('all');
  const [pilotFilterDomain, setPilotFilterDomain] = useState<string>('all');
  const [pilotFilterSubDomain, setPilotFilterSubDomain] = useState<string>('all');
  
  // Pilotage Individual Positioning Mode
  const [isIndividualMode, setIsIndividualMode] = useState<boolean>(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [diagFilterGrade, setDiagFilterGrade] = useState<string>('all');

  const [statusMsg, setStatusMsg] = useState('');

  // --- Fetching Logic ---
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/upsert');
      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          setStudents(data.students || []);
          setCompetences(data.competences || []);
          setResults(data.resultsMap || {});
        } else {
          console.warn('API non disponible (HTML reçu), format vide en attendant.');
        }
      } else {
        console.warn('API non disponible, format vide en attendant.');
      }
    } catch (e) {
      console.error('Erreur chargement données:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Action Handlers ---
  const upsertResult = useCallback(async (
    studentId: string,
    competenceId: number,
    updates: Partial<Pick<Result, 'score' | 'isStarted'>>
  ) => {
    setResults((prev) => {
      const next = { ...prev };
      if (!next[studentId]) next[studentId] = {};
      const current = next[studentId][competenceId] || { studentId, competenceId, score: 0, isStarted: false };
      next[studentId] = { ...next[studentId], [competenceId]: { ...current, ...updates } };
      return next;
    });

    try {
      await fetch('/api/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'result',
          studentId: String(studentId),
          competenceId: parseInt(competenceId as any, 10),
          score: updates.score ?? 0,
          isStarted: updates.isStarted ?? false
        })
      });
    } catch (error) {
      console.error("Erreur upsert:", error);
    }
  }, []);

  const toggleArchiveStudent = useCallback(async (id: string, isArchived: boolean) => {
     setStudents(prev => prev.map(s => s.id === id ? { ...s, isArchived } : s));
     try {
       await fetch('/api/upsert', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           type: 'student_archive',
           id: String(id),
           isArchived
         })
       });
     } catch (e) { console.error('Archive error', e); }
  }, []);

  const startCompetencesForCode = useCallback(async (
    matchingComps: Competence[],
    isStarted: boolean
  ) => {
     setResults((prev) => {
       const next = { ...prev };
       students.forEach(s => {
         if (!next[s.id]) next[s.id] = {};
         matchingComps.forEach(comp => {
            const current = next[s.id][comp.id] || { studentId: s.id, competenceId: comp.id, score: 0, isStarted: false };
            next[s.id] = { ...next[s.id], [comp.id]: { ...current, isStarted } };
         });
       });
       return next;
     });

     try {
        const promises = students.map(s => {
           return Promise.all(matchingComps.map(comp => {
              return fetch('/api/upsert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'result',
                  studentId: String(s.id),
                  competenceId: parseInt(comp.id as any, 10),
                  score: 0,
                  isStarted
                })
              });
           }));
        });
        await Promise.all(promises);
     } catch (e) {
        console.error('Erreur switch compétences', e);
     }
  }, [students]);

  // --- Admin Methods ---
  const handleClearTable = async (tableName: 'Student' | 'Competence' | 'Result') => {
    if (!window.confirm(`⚠️ Voulez-vous vraiment vider la table ${tableName} ?`)) return;
    try {
      const res = await fetch('/api/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear', table: tableName })
      });
      if (res.ok) {
        setStatusMsg(`✅ Table ${tableName} vidée !`);
        await fetchData();
      }
    } catch (err) {
      console.error(err);
      setStatusMsg("❌ Erreur lors du vidage.");
    }
  };

  const handleAddStudent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const body = {
      type: 'student', // Changed from buggy code to ensure backend picks up the type
      firstName: formData.get('firstName') as string,
      lastName: formData.get('lastName') as string,
      grade: formData.get('grade') as string
    };
    if (!body.firstName || !body.lastName || !body.grade) return;

    try {
      const res = await fetch('/api/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        await fetchData();
        setStatusMsg('✅ Élève ajouté !');
        (e.target as HTMLFormElement).reset();
      }
    } catch(err) {
      console.error(err);
      setStatusMsg("❌ Erreur ajout élève.");
    }
  };

  const handleStudentCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setStatusMsg('🚀 Importation des élèves...');
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (resultsBlock) => {
        try {
          const lines = resultsBlock.data as Record<string, string>[];
          
          await fetch('/api/upsert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'student_bulk',
              data: lines
            })
          });
          
          await fetchData();
          setStatusMsg(`✅ Liste des élèves importée ! (${lines.length} ajoutés)`);
        } catch (err) { console.error(err); setStatusMsg('❌ Erreur Import élèves.'); }
      }
    });
  };

  const handleCompetenceCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatusMsg('🚀 Importation des compétences en cours...');
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const lines = results.data as any[];
          const mappedData = lines.map(row => ({
            code: row.code,
            domain: row.domain,
            subDomain: row.subDomain || row.subdomain,
            title: row.title,
            grade: row.grade
          }));

          await fetch('/api/upsert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'competence_bulk',
              data: mappedData
            })
          });

          await fetchData();
          setStatusMsg(`✅ ${lines.length} compétences importées !`);
        } catch (err) {
          console.error(err);
          setStatusMsg("❌ Erreur import CSV.");
        }
      }
    });
  };

  // --- Derived Data for UI ---
  const activeStudents = useMemo(() => students.filter(s => !s.isArchived), [students]);

  const getCode = useCallback((c: Competence) => c.code || c.title.split(' : ')[0] || '', []);
  const getGrade = useCallback((c: Competence) => c.grade || c.domain || '', []);
  const getDomain = useCallback((c: Competence) => c.domain || '', []);

  // Saisie View 
  const filteredStudents = useMemo(() => {
    let filtered = students;
    if (filterGrade !== 'all') filtered = filtered.filter(s => s.grade === filterGrade);
    return filtered.sort((a,b) => (a.isArchived === b.isArchived) ? 0 : a.isArchived ? 1 : -1);
  }, [students, filterGrade]);

  const { uniqueCompGrades, codes } = useMemo(() => {
    let filtered = competences;
    if (filterGrade !== 'all') filtered = filtered.filter(c => getGrade(c) === filterGrade);
    if (filterDomain !== 'all') filtered = filtered.filter(c => getDomain(c) === filterDomain || c.subDomain === filterDomain);
    if (filterSubDomain !== 'all') filtered = filtered.filter(c => c.subDomain === filterSubDomain);

    const grades = Array.from(new Set(competences.map(c => getGrade(c)).filter(Boolean)));
    const allCodes = Array.from(new Set(filtered.map(c => getCode(c)).filter(Boolean) as string[]))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    return { uniqueCompGrades: grades, codes: allCodes };
  }, [competences, filterGrade, filterDomain, filterSubDomain, getCode, getGrade, getDomain]);

  const uniqueGrades = Array.from(new Set(students.map(s => s.grade)));
  const uniqueDomains = Array.from(new Set(competences.map(c => getDomain(c)).filter(Boolean)));
  const uniqueSubCategories = Array.from(new Set(
    competences
      .filter(c => filterDomain === 'all' || getDomain(c) === filterDomain)
      .map(c => c.subDomain)
      .filter(Boolean)
  ));
  const scoreOptions = Array.from({length: 11}, (_, i) => i);

  // All possible grades for Admin form
  const allDBGrades = Array.from(new Set([
    ...students.map(s => s.grade),
    ...competences.map(c => getGrade(c) || '')
  ].filter(Boolean))).sort();

  // Pilotage View
  const { pilotageData, activeComps } = useMemo(() => {
    let activeCompsCount = 0;
    const enhancedComps = competences.map(comp => {
      let green = 0, yellow = 0, red = 0, totalStarted = 0, sumScore = 0;
      
      const relevantStudents = activeStudents.filter(s => s.grade === getGrade(comp));
      
      relevantStudents.forEach(s => {
        const res = results[s.id]?.[comp.id];
        if (res && res.isStarted) {
          totalStarted++;
          sumScore += res.score || 0;
          
          if (res.score >= 5) green++;
          else if (res.score >= 3 && res.score < 5) yellow++;
          else red++;
        }
      });
      
      if (totalStarted > 0) activeCompsCount++;
      
      return { 
        ...comp, 
        totalStarted, 
        green, 
        yellow, 
        red, 
        successRate: totalStarted > 0 ? (green / totalStarted) * 100 : null,
        cohortAvg: totalStarted > 0 ? sumScore / totalStarted : null
      };
    });

    let filtered = enhancedComps.filter(c => c.totalStarted > 0);
    if (pilotFilterGrade !== 'all') filtered = filtered.filter(c => getGrade(c) === pilotFilterGrade);
    if (pilotFilterDomain !== 'all') filtered = filtered.filter(c => getDomain(c) === pilotFilterDomain || c.subDomain === pilotFilterDomain);
    if (pilotFilterSubDomain !== 'all') filtered = filtered.filter(c => c.subDomain === pilotFilterSubDomain);

    const grouped: Record<string, Record<string, typeof filtered>> = {};
    filtered.forEach(c => {
       const dom = getDomain(c) || 'Sans domaine';
       const sub = c.subDomain || 'Sans sous-domaine';
       if (!grouped[dom]) grouped[dom] = {};
       if (!grouped[dom][sub]) grouped[dom][sub] = [];
       grouped[dom][sub].push(c);
    });

    return { pilotageData: grouped, activeComps: activeCompsCount, flatFilteredComps: filtered };
  }, [competences, activeStudents, results, pilotFilterGrade, pilotFilterDomain, pilotFilterSubDomain, getGrade, getDomain]);

  const pilotUniqueDomains = Array.from(new Set(competences.map(c => getDomain(c)).filter(Boolean)));
  const pilotUniqueSubCategories = Array.from(new Set(
    competences
      .filter(c => pilotFilterDomain === 'all' || getDomain(c) === pilotFilterDomain)
      .map(c => c.subDomain)
      .filter(Boolean)
  ));

  const calculateStudentStock = useCallback((studentId: string) => {
    let stock = 0;
    const compMap = results[studentId];
    if (compMap) {
      Object.values(compMap).forEach(res => {
         if (res && res.isStarted && res.score !== undefined) {
            stock += res.score;
         }
      });
    }
    return stock;
  }, [results]);

  const diagnosticData = useMemo(() => {
    const relevantStudents = activeStudents.filter(s => diagFilterGrade === 'all' || s.grade === diagFilterGrade);
    const studentsWithStock = relevantStudents.map(s => {
       return { ...s, stock: calculateStudentStock(s.id) };
    });

    const avgStock = studentsWithStock.length > 0 
       ? studentsWithStock.reduce((acc, s) => acc + s.stock, 0) / studentsWithStock.length 
       : 0;

    const bottomStudents = [...studentsWithStock]
       .filter(s => s.stock < avgStock)
       .sort((a, b) => a.stock - b.stock)
       .slice(0, 5);

    const topStudents = [...studentsWithStock]
       .filter(s => s.stock >= avgStock)
       .sort((a, b) => b.stock - a.stock)
       .slice(0, 5);

    // Filter competences
    const relevantComps = competences.filter(c => diagFilterGrade === 'all' || getGrade(c) === diagFilterGrade);
    const compsWithAvg = relevantComps.map(c => {
       const studentsForComp = activeStudents.filter(s => s.grade === getGrade(c));
       let sum = 0;
       let count = 0;
       studentsForComp.forEach(s => {
          const res = results[s.id]?.[c.id];
          if (res && res.isStarted && res.score !== undefined) {
             sum += res.score;
             count++;
          }
       });
       return { 
         ...c, 
         avg: count > 0 ? sum / count : null,
         count
       };
    }).filter(c => c.count > 0 && c.avg !== null);

    const topComps = [...compsWithAvg].sort((a, b) => (b.avg as number) - (a.avg as number)).slice(0, 3);
    const bottomComps = [...compsWithAvg].sort((a, b) => (a.avg as number) - (b.avg as number)).slice(0, 3);

    return { topStudents, bottomStudents, topComps, bottomComps };
  }, [competences, activeStudents, results, diagFilterGrade, getGrade, calculateStudentStock]);

  const handleToggleEditMode = () => {
    if (isEditMode) {
      setIsEditMode(false);
    } else {
      const expectedEditPassword = import.meta.env.VITE_EDIT_PASSWORD || 'editsecret';
      const pwd = window.prompt('Veuillez entrer le mot de passe de saisie :');
      if (pwd === expectedEditPassword || import.meta.env.VITE_EDIT_PASSWORD === undefined) {
        setIsEditMode(true);
      } else if (pwd !== null) {
        alert('Mot de passe incorrect');
      }
    }
  };

  if (!isAuthenticated) {
    const expectedPassword = import.meta.env.VITE_LOGIN_PASSWORD || 'secret';
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 font-sans">
        <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-sm border border-slate-200">
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
              <Lock className="w-6 h-6 text-indigo-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">Accès sécurisé</h2>
            <p className="text-sm text-slate-500 text-center mt-2">Veuillez entrer le mot de passe pour accéder à l'application.</p>
          </div>
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (loginInput === expectedPassword || import.meta.env.VITE_LOGIN_PASSWORD === undefined) {
                setIsAuthenticated(true);
              } else {
                alert('Mot de passe incorrect');
              }
            }}
            className="space-y-4"
          >
            <div>
              <input
                type="password"
                value={loginInput}
                onChange={(e) => setLoginInput(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                placeholder="Mot de passe"
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg shadow transition"
            >
              Déverrouiller
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  // Column Metrics Reference
  const codeColWidth = 140;
  const titleColWidth = 220;

  return (
    <div translate="no" className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900">
      {/* HEADER */}
      <header className="bg-indigo-700 text-white shadow-md z-50 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-indigo-200" />
            <h1 className="text-xl font-bold tracking-tight">Suivi Elèves - Julie Carnis-Bréart</h1>
          </div>
          <div className="flex gap-1 overflow-x-auto">
            <button onClick={() => setActiveTab('saisie')} className={cn("px-4 py-2 rounded-md font-medium text-sm transition-colors flex items-center gap-2", activeTab === 'saisie' ? 'bg-indigo-600 shadow-inner text-white' : 'text-indigo-100 hover:bg-indigo-600/50')}>
              <BookOpen className="w-4 h-4" /> Saisie des notes
            </button>
            <button onClick={() => setActiveTab('pilotage')} className={cn("px-4 py-2 rounded-md font-medium text-sm transition-colors flex items-center gap-2", activeTab === 'pilotage' ? 'bg-indigo-600 shadow-inner text-white' : 'text-indigo-100 hover:bg-indigo-600/50')}>
              <BarChart2 className="w-4 h-4" /> Pilotage
            </button>
            <button onClick={() => setActiveTab('admin')} className={cn("px-4 py-2 rounded-md font-medium text-sm transition-colors flex items-center gap-2", activeTab === 'admin' ? 'bg-indigo-600 shadow-inner text-white' : 'text-indigo-100 hover:bg-indigo-600/50')}>
              <Settings className="w-4 h-4" /> Admin
            </button>
          </div>
        </div>
      </header>

      {/* TABS */}
      {activeTab === 'saisie' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Filters Bar */}
          <div className="bg-white border-b border-slate-200 p-3 flex items-center justify-between shrink-0 overflow-x-auto shadow-sm z-40">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">Niveau (Élèves)</label>
                <select value={filterGrade} onChange={e => setFilterGrade(e.target.value)} className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-sm font-medium focus:ring-2 focus:ring-indigo-500">
                  <option value="all">Tous (Cohorte)</option>
                  {uniqueGrades.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="w-px h-6 bg-slate-300 mx-2"></div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-600">Domaine</label>
                <select value={filterDomain} onChange={e => {setFilterDomain(e.target.value); setFilterSubDomain('all');}} className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-sm font-medium focus:ring-2 focus:ring-indigo-500">
                  <option value="all">Tous</option>
                  {uniqueDomains.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-600">Sous-domaine</label>
                <select value={filterSubDomain} onChange={e => setFilterSubDomain(e.target.value)} className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-sm font-medium focus:ring-2 focus:ring-indigo-500">
                   <option value="all">Tous</option>
                   {uniqueSubCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            
            <div className="flex items-center ml-4 shrink-0">
              <button
                onClick={handleToggleEditMode}
                className={cn("flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors border", isEditMode ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50")}
              >
                {isEditMode ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                {isEditMode ? 'Mode Saisie: Actif' : 'Activer Saisie'}
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="flex-1 flex overflow-auto relative">
            <table className="w-max text-left border-separate border-spacing-0">
              <thead className="bg-slate-200 z-40 sticky top-0 shadow-sm">
                <tr>
                   <th 
                     colSpan={1 + uniqueCompGrades.length}
                     className="sticky top-0 left-0 z-50 p-0 bg-slate-300 border-none shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)] align-bottom">
                     <div className="flex h-full items-stretch">
                       <div className="w-[140px] shrink-0 p-2 border-r border-b border-slate-400 flex flex-col justify-end font-bold text-[11px] uppercase text-slate-700 text-left">
                         Code
                       </div>
                       {uniqueCompGrades.map((g, i) => (
                         <div 
                           key={g || i} 
                           className={cn(
                             "w-[220px] shrink-0 bg-slate-200 p-2 border-r border-b border-slate-300 flex flex-col justify-end font-bold text-[10px] uppercase text-slate-600 text-left"
                           )}>
                           Titre {g}
                         </div>
                       ))}
                     </div>
                   </th>
                   
                   {filteredStudents.map(student => (
                     <th key={student.id} className={cn(
                       "p-3 border-r border-b border-slate-300 align-bottom bg-slate-100 min-w-[100px] w-32 relative text-center z-30 sticky top-0",
                       student.isArchived && "opacity-60 bg-slate-200"
                     )}>
                        <div className="flex flex-col items-center justify-end h-full gap-1">
                           <label className={cn("flex items-center mb-1", isEditMode ? "cursor-pointer" : "pointer-events-none opacity-80")} title="Archiver / Réveiller élève">
                              <input type="checkbox" className="sr-only" checked={student.isArchived} onChange={e => toggleArchiveStudent(student.id, e.target.checked)} />
                              <div className={cn("w-6 h-3 rounded-full transition flex items-center px-0.5", student.isArchived ? 'bg-indigo-400' : 'bg-slate-300')}>
                                <div className={cn("bg-white w-2 h-2 rounded-full shadow-sm transform transition", student.isArchived && 'translate-x-3')}></div>
                              </div>
                           </label>
                           {student.isArchived && <UserX className="w-4 h-4 text-slate-400" />}
                           <p className={cn("text-[11px] font-bold uppercase", student.isArchived ? "text-slate-400 line-through" : "text-slate-800")}>{student.lastName}</p>
                           <p className="text-xs font-semibold text-slate-600 truncate max-w-full">{student.firstName}</p>
                           <p className="text-[10px] text-slate-500">{student.grade}</p>
                        </div>
                     </th>
                   ))}
                </tr>
              </thead>
              <tbody>
                {codes.map(code => {
                  const matchingComps = competences.filter(c => getCode(c) === code);
                  let isCodeStarted = false;
                  for (const s of students) {
                     for (const c of matchingComps) {
                        if (results[s.id]?.[c.id]?.isStarted) {
                           isCodeStarted = true;
                           break;
                        }
                     }
                     if (isCodeStarted) break;
                  }

                  return (
                    <tr key={code} className="hover:bg-slate-50 transition border-b border-slate-200 group">
                      <td 
                        colSpan={1 + uniqueCompGrades.length}
                        className="sticky left-0 z-40 p-0 bg-white group-hover:bg-slate-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)] border-none align-middle"
                      >
                         <div className="flex h-full items-stretch">
                           <div className="w-[140px] shrink-0 p-2 border-r border-b border-slate-200 flex items-center justify-between bg-white group-hover:bg-slate-50">
                             <span className="font-bold text-slate-700 text-xs truncate mr-2" title={code}>{code}</span>
                             <button 
                               onClick={() => startCompetencesForCode(matchingComps, !isCodeStarted)}
                               title="Activer cette compétence pour tous"
                               className={cn("p-1.5 border shadow-sm rounded-full transition shrink-0", isCodeStarted ? "bg-indigo-100 text-indigo-700 border-indigo-200 hover:bg-indigo-200" : "bg-white text-slate-400 border-slate-300 hover:text-indigo-500 hover:border-indigo-300", !isEditMode && "pointer-events-none opacity-50")}
                             >
                               <Power className="w-3 h-3" />
                             </button>
                           </div>
                           
                           {uniqueCompGrades.map((g, i) => {
                             const compForGrade = matchingComps.find(c => getGrade(c) === g);
                             let displayTitle = '-';
                             if (compForGrade) {
                                displayTitle = compForGrade.title;
                                if (displayTitle.includes(' : ')) {
                                   displayTitle = displayTitle.split(' : ').slice(1).join(' : ');
                                }
                             }
                             
                             return (
                               <div 
                                 key={g || i} 
                                 className="w-[220px] shrink-0 p-2 border-r border-b border-slate-200 flex items-center text-[11px] leading-tight text-slate-600 bg-white group-hover:bg-slate-50"
                                 title={compForGrade ? compForGrade.title : ''}
                               >
                                  {compForGrade ? displayTitle : <span className="text-slate-300 italic">-</span>}
                               </div>
                             );
                           })}
                         </div>
                      </td>

                      {filteredStudents.map(student => {
                         const comp = matchingComps.find(c => getGrade(c) === student.grade);
                         if (!comp) {
                            return (
                              <td key={student.id} className="p-2 border-r border-b border-slate-200 bg-slate-100/30 align-middle text-center">
                                 <span className="text-[10px] text-slate-300 font-medium">Non dispo</span>
                              </td>
                            );
                         }

                         const result = results[student.id]?.[comp.id] || { score: 0, isStarted: false };
                         const score = result.score;
                         
                         if (!isCodeStarted) {
                            return (
                              <td key={student.id} className="p-2 border-r border-b border-slate-200 align-middle text-center bg-slate-50 opacity-50">
                                 <span className="text-[10px] text-slate-400">-</span>
                              </td>
                            );
                         }

                         return (
                            <td key={student.id} className={cn("p-1.5 border-r border-b border-slate-200 align-middle text-center transition", getScoreColor(score, true), student.isArchived && "opacity-60", !isEditMode && "pointer-events-none")}>
                               <select 
                                 value={score}
                                 onChange={(e) => upsertResult(student.id, comp.id, { score: Number(e.target.value), isStarted: true })}
                                 className={cn("text-sm rounded block w-full p-1 font-bold focus:ring-2 focus:ring-indigo-500 text-center text-center-last appearance-none outline-none", isEditMode ? "bg-white border shadow-sm cursor-pointer" : "bg-transparent border-transparent cursor-default", score >= 5 ? "border-emerald-300 text-emerald-700" : score >= 3 ? "border-amber-300 text-amber-700" : "border-rose-300 text-rose-700")}
                                 disabled={!isEditMode}
                               >
                                 {scoreOptions.map(n => <option key={n} value={n}>{n} / 10</option>)}
                               </select>
                            </td>
                         );
                      })}
                    </tr>
                  );
                })}
                
                {codes.length === 0 && (
                  <tr>
                    <td colSpan={1 + uniqueCompGrades.length + filteredStudents.length} className="text-center p-8 text-slate-500 bg-white">
                      Aucune compétence trouvée. Importez la progression.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="bg-white border-t border-slate-300 p-2 flex items-center justify-between shrink-0 shadow-sm z-40">
            <p className="text-[10px] font-bold text-slate-500">
               {codes.length} codes affichés | {filteredStudents.length} élèves
            </p>
          </div>
        </div>
      )}

      {activeTab === 'pilotage' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Filters Bar for Pilotage */}
          <div className="bg-white border-b border-slate-200 p-3 flex items-center gap-4 shrink-0 overflow-x-auto shadow-sm z-40">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">Niveau</label>
              <select value={pilotFilterGrade} onChange={e => setPilotFilterGrade(e.target.value)} className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-sm font-medium focus:ring-2 focus:ring-indigo-500">
                <option value="all">Tous (Cohorte)</option>
                {uniqueGrades.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="w-px h-6 bg-slate-300 mx-2"></div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600">Domaine</label>
              <select value={pilotFilterDomain} onChange={e => {setPilotFilterDomain(e.target.value); setPilotFilterSubDomain('all');}} className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-sm font-medium focus:ring-2 focus:ring-indigo-500">
                <option value="all">Tous</option>
                {pilotUniqueDomains.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600">Sous-domaine</label>
              <select value={pilotFilterSubDomain} onChange={e => setPilotFilterSubDomain(e.target.value)} className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-sm font-medium focus:ring-2 focus:ring-indigo-500">
                 <option value="all">Tous</option>
                 {pilotUniqueSubCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="flex-1 p-6 overflow-auto">
            <div className="w-full space-y-6">
                   {/* Positionnement Individuel */}
                   <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                         <label className="flex items-center gap-3 cursor-pointer shrink-0">
                            <input type="checkbox" checked={isIndividualMode} onChange={e => setIsIndividualMode(e.target.checked)} className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" />
                            <span className="font-semibold text-slate-700">Positionnement individuel</span>
                         </label>
                         
                         {isIndividualMode && (
                            <div className="flex gap-3 items-center flex-1 w-full overflow-hidden">
                               <span className="text-sm font-medium text-slate-600 whitespace-nowrap">Élèves :</span>
                               <div className="flex gap-2 overflow-x-auto pb-2 flex-1 scrollbar-thin">
                                  {activeStudents.filter(s => pilotFilterGrade === 'all' || s.grade === pilotFilterGrade).map(s => {
                                     const isSelected = selectedStudentIds.includes(s.id);
                                     return (
                                        <label key={s.id} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs cursor-pointer whitespace-nowrap transition-colors shrink-0", isSelected ? 'bg-indigo-100 border-indigo-300 text-indigo-800' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50')}>
                                           <input 
                                              type="checkbox" 
                                              className="sr-only"
                                              checked={isSelected}
                                              onChange={(e) => {
                                                 if (e.target.checked) setSelectedStudentIds(prev => [...prev, s.id]);
                                                 else setSelectedStudentIds(prev => prev.filter(id => id !== s.id));
                                              }}
                                           />
                                           <div className={cn("w-3 h-3 rounded flex items-center justify-center border", isSelected ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-400')}>
                                              {isSelected && <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                           </div>
                                           {s.firstName} {s.lastName}
                                        </label>
                                     );
                                  })}
                               </div>
                            </div>
                         )}
                      </div>
                   </div>

                   {/* Life Bar / Progression Annuelle */}
                   {(() => {
                      let tGreen = 0, tOrange = 0, tRed = 0, tGrey = 0;
                      
                      const filteredStudentsForLifeBar = activeStudents.filter(s => pilotFilterGrade === 'all' || s.grade === pilotFilterGrade);
                      const relevantComps = competences.filter(c => pilotFilterGrade === 'all' || getGrade(c) === pilotFilterGrade);

                      filteredStudentsForLifeBar.forEach(s => {
                         relevantComps.forEach(c => {
                            const res = results[s.id]?.[c.id];
                            if (res && res.isStarted && res.score !== undefined) {
                               if (res.score >= 5) tGreen++;
                               else if (res.score >= 3 && res.score < 5) tOrange++;
                               else tRed++;
                            } else {
                               tGrey++;
                            }
                         });
                      });

                      const total = tGreen + tOrange + tRed + tGrey;
                      if (total === 0) return null;

                      const pGreen = (tGreen / total) * 100;
                      const pOrange = (tOrange / total) * 100;
                      const pRed = (tRed / total) * 100;
                      const pGrey = (tGrey / total) * 100;

                      return (
                         <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                            <h3 className="font-semibold text-slate-800 mb-4">Progression Annuelle (Vue globale {pilotFilterGrade === 'all' ? 'Cohorte' : pilotFilterGrade})</h3>
                            <div className="flex h-6 rounded-full overflow-hidden shadow-inner w-full">
                               {pGreen > 0 && <div style={{ width: `${pGreen}%` }} className="bg-emerald-500 h-full transition-all group relative" title={`Validé: ${tGreen} (${pGreen.toFixed(1)}%)`}></div>}
                               {pOrange > 0 && <div style={{ width: `${pOrange}%` }} className="bg-amber-400 h-full transition-all group relative" title={`En cours: ${tOrange} (${pOrange.toFixed(1)}%)`}></div>}
                               {pRed > 0 && <div style={{ width: `${pRed}%` }} className="bg-rose-500 h-full transition-all group relative" title={`Non acquis: ${tRed} (${pRed.toFixed(1)}%)`}></div>}
                               {pGrey > 0 && <div style={{ width: `${pGrey}%` }} className="bg-slate-200 h-full transition-all group relative" title={`Non évalué: ${tGrey} (${pGrey.toFixed(1)}%)`}></div>}
                            </div>
                            <div className="flex justify-between items-center text-xs font-medium text-slate-500 mt-3 px-1">
                               <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-emerald-500"></div> Validé ({pGreen.toFixed(1)}%)</div>
                               <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-amber-400"></div> En cours ({pOrange.toFixed(1)}%)</div>
                               <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-rose-500"></div> Non acquis ({pRed.toFixed(1)}%)</div>
                               <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-slate-200"></div> Non évalué ({pGrey.toFixed(1)}%)</div>
                            </div>
                         </div>
                      );
                   })()}

                   {/* Graphique */}
                   <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                     <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                        <h3 className="font-semibold text-slate-800">Taux de réussite par compétence</h3>
                     </div>
                     <div className="p-6">
                        {(() => {
                           const scaleValue = (score: number) => {
                              if (score <= 5) return score * 16;
                              return 80 + (score - 5) * 4;
                           };

                           const chartData: any[] = [];
                           let gapCount = 1;
                           // On s'assure que si un domaine est sélectionné, on n'itère QUE sur lui. 
                           let domainsToIterate = Object.keys(pilotageData).sort((a,b) => a.localeCompare(b));
                           if (pilotFilterDomain !== 'all') {
                              domainsToIterate = domainsToIterate.filter(d => d === pilotFilterDomain);
                           }
                           
                           domainsToIterate.forEach((domain, domIndex) => {
                              let subDomains = Object.keys(pilotageData[domain] || {}).sort((a,b) => a.localeCompare(b));
                              if (pilotFilterSubDomain !== 'all') {
                                 subDomains = subDomains.filter(sd => sd === pilotFilterSubDomain);
                              }

                              subDomains.forEach((subDomain, index) => {
                                 const comps = pilotageData[domain][subDomain];
                                 comps.sort((a,b) => getCode(a).localeCompare(getCode(b), undefined, { numeric: true }));
                                 
                                 comps.forEach(c => {
                                    const codeLabel = pilotFilterGrade === 'all' ? `${getGrade(c)} - ${getCode(c)}` : getCode(c);
                                    const dataPoint: any = {
                                       name: codeLabel,
                                       domain: domain,
                                       subDomain: subDomain === 'Sans sous-domaine' ? '' : subDomain,
                                       cohortAvg: c.cohortAvg !== null ? Number(c.cohortAvg).toFixed(2) : null,
                                    };
                                    
                                    dataPoint.cohortAvgScaled = c.cohortAvg !== null && c.cohortAvg !== undefined ? scaleValue(Number(c.cohortAvg)) : null;

                                    // Cohort percentages for the tooltip
                                    if (c.totalStarted > 0) {
                                       dataPoint.pctRed = (c.red / c.totalStarted) * 100;
                                       dataPoint.pctOrange = (c.yellow / c.totalStarted) * 100;
                                       dataPoint.pctGreen = (c.green / c.totalStarted) * 100;
                                    } else {
                                       dataPoint.pctRed = 0;
                                       dataPoint.pctOrange = 0;
                                       dataPoint.pctGreen = 0;
                                    }

                                    // Background scale zones (fixed heights that stack up to exactly 100 on the left scale)
                                    dataPoint.zoneRed = 48;    // from 0 to 48 (score 3)
                                    dataPoint.zoneOrange = 32; // from 48 to 80 (score 5)
                                    dataPoint.zoneGreen = 20;  // from 80 to 100 (score 10)
                                    
                                    if (isIndividualMode) {
                                       selectedStudentIds.forEach(studentId => {
                                          const s = students.find(st => st.id === studentId);
                                          if (s && s.grade === getGrade(c)) {
                                             const res = results[studentId]?.[c.id];
                                             if (res && res.isStarted && res.score !== undefined) {
                                                dataPoint[`student_${studentId}`] = res.score;
                                                dataPoint[`student_${studentId}_scaled`] = scaleValue(res.score);
                                             }
                                          }
                                       });
                                    }
                                    
                                    chartData.push(dataPoint);
                                 });
                                 
                                 const isLastDom = domIndex === domainsToIterate.length - 1;
                                 const isLastSub = index === subDomains.length - 1;
                                 if (!isLastDom || !isLastSub) {
                                    chartData.push({ name: ' '.repeat(gapCount++), isGap: true });
                                 }
                              });
                           });

                           if (chartData.length === 0) {
                              return <div className="p-6 text-center text-slate-500 italic">Aucune donnée démarrée pour cette sélection.</div>;
                           }

                           const studentColors = ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#91eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', '#008080'];
                           
                           const showCohortAvg = !isIndividualMode || selectedStudentIds.length === 0;

                           return (
                              <div className="h-[300px] w-full">
                                 <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 40 }}>
                                       <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                       <XAxis 
                                          dataKey="name" 
                                          angle={-45} 
                                          textAnchor="end"
                                          height={60}
                                          tick={{ fontSize: 11, fill: '#475569', fontWeight: 'bold' }}
                                          interval={0}
                                       />
                                       <YAxis 
                                          yAxisId="left"
                                          domain={[0, 100]} 
                                          ticks={[0, 32, 64, 80, 84, 92, 100]}
                                          tickFormatter={(val) => {
                                             if (val <= 80) return String(Math.round(val / 16));
                                             return String(Math.round(5 + (val - 80) / 4));
                                          }}
                                          tick={{ fontSize: 12, fill: '#475569' }}
                                       />
                                       <Tooltip 
                                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                          labelStyle={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}
                                          formatter={(value: any, name: string, props: any) => {
                                             const payload = props.payload || {};
                                             
                                             if (name === 'Validé (>= 5)') {
                                                return [payload.pctGreen !== undefined ? `${Number(payload.pctGreen).toFixed(1)} %` : '0.0 %', name];
                                             }
                                             if (name === 'En cours (3-4)') {
                                                return [payload.pctOrange !== undefined ? `${Number(payload.pctOrange).toFixed(1)} %` : '0.0 %', name];
                                             }
                                             if (name === 'Non acquis (< 3)') {
                                                return [payload.pctRed !== undefined ? `${Number(payload.pctRed).toFixed(1)} %` : '0.0 %', name];
                                             }
                                             
                                             if (name === 'Moyenne Cohorte') {
                                                return [payload.cohortAvg !== null && payload.cohortAvg !== undefined ? Number(payload.cohortAvg).toFixed(1) : value, name];
                                             }
                                             
                                             // Pour les élèves : on récupère la valeur non-transformée
                                             if (props.dataKey && typeof props.dataKey === 'string' && props.dataKey.endsWith('_scaled')) {
                                                const originalKey = props.dataKey.replace('_scaled', '');
                                                const originalValue = payload[originalKey];
                                                if (originalValue !== undefined) {
                                                   const studentId = originalKey.replace('student_', '');
                                                   const stock = calculateStudentStock(studentId);
                                                   const formatVal = !Number.isInteger(originalValue) ? Number(originalValue).toFixed(1) : originalValue;
                                                   return [
                                                      <div key={studentId}>
                                                         <span>Note : {formatVal} / 10</span>
                                                         <span className="block text-[10px] font-normal text-slate-500 mt-1">Score global : {stock} réussites</span>
                                                      </div>,
                                                      name
                                                   ];
                                                }
                                             }
                                             
                                             return [value, name];
                                          }}
                                       />
                                       <Legend verticalAlign="top" height={36} />
                                       
                                       {/* Background Stacked Bars via constant zones */}
                                       <Bar yAxisId="left" dataKey="zoneRed" stackId="a" fill="#fda4af" opacity={0.6} name="Non acquis (< 3)" barSize={15} />
                                       <Bar yAxisId="left" dataKey="zoneOrange" stackId="a" fill="#fcd34d" opacity={0.6} name="En cours (3-4)" />
                                       <Bar yAxisId="left" dataKey="zoneGreen" stackId="a" fill="#6ee7b7" opacity={0.6} name="Validé (>= 5)" />
                                       
                                       <ReferenceLine y={80} yAxisId="left" stroke="#22c55e" strokeWidth={2} label={{ position: 'insideTopLeft', value: 'Seuil (5/10)', fill: '#22c55e', fontSize: 12, fontWeight: 'bold' }} />
                                       
                                       {showCohortAvg && (
                                          <Line 
                                             yAxisId="left"
                                             type="monotone" 
                                             dataKey="cohortAvgScaled" 
                                             name="Moyenne Cohorte"
                                             stroke="#4f46e5" 
                                             strokeWidth={3}
                                             dot={{ r: 4, fill: '#4f46e5', strokeWidth: 2, stroke: '#fff' }}
                                             activeDot={{ r: 6 }}
                                             connectNulls={false}
                                          />
                                       )}

                                       {isIndividualMode && selectedStudentIds.map((studentId, idx) => {
                                          const s = students.find(st => st.id === studentId);
                                          const labelName = s ? `${s.firstName} ${s.lastName}` : `Élève ${studentId}`;
                                          return (
                                             <Line 
                                                yAxisId="left"
                                                key={studentId}
                                                type="monotone" 
                                                dataKey={`student_${studentId}_scaled`}
                                                name={labelName}
                                                stroke={studentColors[idx % studentColors.length]}
                                                strokeWidth={2}
                                                dot={{ r: 3 }}
                                                activeDot={{ r: 5 }}
                                                connectNulls={false}
                                             />
                                          );
                                       })}
                                    </ComposedChart>
                                 </ResponsiveContainer>
                              </div>
                           );
                        })()}
                     </div>
                   </div>

                   {/* Diagnostic Stratégique */}
                   <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                         <h3 className="font-semibold text-slate-800">Diagnostic Stratégique</h3>
                         <div className="flex items-center gap-2">
                            <label className="text-xs font-semibold text-slate-600">Niveau</label>
                            <select value={diagFilterGrade} onChange={e => setDiagFilterGrade(e.target.value)} className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-medium focus:ring-2 focus:ring-indigo-500">
                               <option value="all">Tous</option>
                               {uniqueGrades.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                         </div>
                      </div>
                      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                         {/* Alertes */}
                         <div>
                            <h4 className="text-sm font-semibold text-rose-700 mb-3 flex items-center justify-between">
                               <span>Alertes (Plus faibles stocks)</span>
                            </h4>
                            <ul className="space-y-2">
                               {diagnosticData.bottomStudents.map(s => (
                                  <li key={s.id} className="flex items-center justify-between p-2 rounded bg-rose-50 border border-rose-100 text-sm">
                                     <span className="font-medium text-slate-700">{s.firstName} {s.lastName} <span className="text-xs text-slate-500">({s.grade})</span></span>
                                     <span className="font-bold text-rose-600">{s.stock} pts</span>
                                  </li>
                               ))}
                               {diagnosticData.bottomStudents.length === 0 && <li className="text-xs text-slate-400 italic">Aucune donnée.</li>}
                            </ul>
                         </div>
                         {/* Excellence */}
                         <div>
                            <h4 className="text-sm font-semibold text-emerald-700 mb-3 flex items-center justify-between">
                               <span>Excellence (Meilleurs stocks)</span>
                            </h4>
                            <ul className="space-y-2">
                               {diagnosticData.topStudents.map(s => (
                                  <li key={s.id} className="flex items-center justify-between p-2 rounded bg-emerald-50 border border-emerald-100 text-sm">
                                     <span className="font-medium text-slate-700">{s.firstName} {s.lastName} <span className="text-xs text-slate-500">({s.grade})</span></span>
                                     <span className="font-bold text-emerald-600">{s.stock} pts</span>
                                  </li>
                               ))}
                               {diagnosticData.topStudents.length === 0 && <li className="text-xs text-slate-400 italic">Aucune donnée.</li>}
                            </ul>
                         </div>
                         {/* Notions à besoins */}
                         <div>
                            <h4 className="text-sm font-semibold text-amber-700 mb-3 flex items-center justify-between">
                               <span>Notions à besoins (Moy. faibles)</span>
                            </h4>
                            <ul className="space-y-2">
                               {diagnosticData.bottomComps.map(c => (
                                  <li key={c.id} className="flex items-center justify-between p-2 rounded bg-amber-50 border border-amber-100 text-sm">
                                     <span className="font-medium text-slate-700 truncate mr-2" title={c.title}>{getCode(c)} - {c.title}</span>
                                     <span className="font-bold text-amber-600 whitespace-nowrap">{c.avg?.toFixed(1)} / 10</span>
                                  </li>
                               ))}
                               {diagnosticData.bottomComps.length === 0 && <li className="text-xs text-slate-400 italic">Aucune donnée.</li>}
                            </ul>
                         </div>
                         {/* Notions réussies */}
                         <div>
                            <h4 className="text-sm font-semibold text-indigo-700 mb-3 flex items-center justify-between">
                               <span>Notions réussies (Moy. hautes)</span>
                            </h4>
                            <ul className="space-y-2">
                               {diagnosticData.topComps.map(c => (
                                  <li key={c.id} className="flex items-center justify-between p-2 rounded bg-indigo-50 border border-indigo-100 text-sm">
                                     <span className="font-medium text-slate-700 truncate mr-2" title={c.title}>{getCode(c)} - {c.title}</span>
                                     <span className="font-bold text-indigo-600 whitespace-nowrap">{c.avg?.toFixed(1)} / 10</span>
                                  </li>
                               ))}
                               {diagnosticData.topComps.length === 0 && <li className="text-xs text-slate-400 italic">Aucune donnée.</li>}
                            </ul>
                         </div>
                      </div>
                   </div>

              {/* Analyse de la cohorte (en bas) */}
              <div className="pt-2">
                 <h2 className="text-xl font-bold text-slate-800 tracking-tight mb-4">Analyse de la cohorte</h2>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                       <p className="text-sm font-medium text-slate-500 mb-1">Élèves Actifs</p>
                       <p className="text-2xl font-bold text-indigo-700">{activeStudents.length}</p>
                       <p className="text-xs text-slate-400 mt-1">{students.length - activeStudents.length} archivés</p>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                       <p className="text-sm font-medium text-slate-500 mb-1">Compétences Démarrées</p>
                       <p className="text-2xl font-bold text-emerald-600">{activeComps}</p>
                       <p className="text-xs text-slate-400 mt-1">Sur {competences.length} au total</p>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                       <p className="text-sm font-medium text-slate-500 mb-1">Niveaux</p>
                       <div className="flex flex-wrap gap-2 mt-2">
                         {uniqueGrades.map(g => (
                           <span key={g} className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-semibold">{g}</span>
                         ))}
                       </div>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'admin' && (
        <div className="flex-1 p-6 overflow-auto bg-slate-100">
          <div className="max-w-3xl mx-auto space-y-6">
            
            {statusMsg && (
              <div className="bg-indigo-50 border border-indigo-200 text-indigo-800 px-4 py-3 rounded-lg shadow-sm font-medium flex items-center gap-3">
                <ShieldAlert className="w-5 h-5" />
                {statusMsg}
              </div>
            )}
            
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
               <div className="p-5 border-b border-slate-200 bg-slate-50">
                 <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                   <Upload className="w-5 h-5 text-indigo-500" /> Imports CSV
                 </h2>
               </div>
               <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="border border-slate-200 rounded-lg p-5 hover:border-indigo-300 hover:shadow-md transition">
                    <h3 className="font-semibold mb-2">1. Liste des Élèves</h3>
                    <p className="text-xs text-slate-500 mb-4 h-12">Format objet direct depuis en-têtes</p>
                    <label className="cursor-pointer bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold py-2 px-4 rounded shadow block text-center transition">
                      Sélectionner le fichier
                      <input type="file" accept=".csv" className="hidden" onChange={handleStudentCSV} />
                    </label>
                 </div>
                 <div className="border border-slate-200 rounded-lg p-5 hover:border-indigo-300 hover:shadow-md transition">
                    <h3 className="font-semibold mb-2">2. Progression Cycle</h3>
                    <p className="text-xs text-slate-500 mb-4 h-12">Format: code, domain, subDomain, title, grade</p>
                    <label className="cursor-pointer bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold py-2 px-4 rounded shadow block text-center transition">
                      Sélectionner le fichier
                      <input type="file" accept=".csv" className="hidden" onChange={handleCompetenceCSV} />
                    </label>
                 </div>
               </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
               <div className="p-5 border-b border-slate-200 bg-slate-50">
                 <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                   <PlusCircle className="w-5 h-5 text-emerald-500" /> Ajouter Élève Manuellement
                 </h2>
               </div>
               <form onSubmit={handleAddStudent} className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                     <div>
                       <label className="block text-xs font-semibold text-slate-600 mb-1">Prénom</label>
                       <input name="firstName" type="text" required className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 text-sm" placeholder="Jean" />
                     </div>
                     <div>
                       <label className="block text-xs font-semibold text-slate-600 mb-1">Nom</label>
                       <input name="lastName" type="text" required className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 text-sm" placeholder="Dupont" />
                     </div>
                     <div>
                       <label className="block text-xs font-semibold text-slate-600 mb-1">Niveau</label>
                       <input 
                         name="grade" 
                         type="text" 
                         list="grade-options" 
                         required 
                         className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 text-sm" 
                         placeholder="Ex: CM1, 6ème..." 
                       />
                       <datalist id="grade-options">
                          {allDBGrades.map(g => (
                            <option key={g} value={g} />
                          ))}
                       </datalist>
                     </div>
                  </div>
                  <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-6 rounded shadow-sm transition text-sm">
                    Ajouter
                  </button>
               </form>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
               <div className="p-5 border-b border-rose-100 bg-rose-50">
                 <h2 className="text-lg font-bold text-rose-800 flex items-center gap-2">
                   <Trash2 className="w-5 h-5" /> Zone Danger (Remise à Zéro)
                 </h2>
               </div>
               <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                 <button onClick={() => handleClearTable('Student')} className="bg-rose-100 hover:bg-rose-200 text-rose-700 px-4 py-2 rounded-lg transition-colors">
                    Vider Élèves
                 </button>
                 <button onClick={() => handleClearTable('Competence')} className="bg-rose-100 hover:bg-rose-200 text-rose-700 px-4 py-2 rounded-lg transition-colors">
                    Vider Progression
                 </button>
                 <button onClick={() => handleClearTable('Result')} className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg transition-colors">
                    Purger Notes
                 </button>
               </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Global CSS injected directly */}
      <style>{`
        .text-center-last {
          text-align-last: center;
        }
        select {
          -moz-appearance: none;
          -webkit-appearance: none;
        }
      `}</style>
    </div>
  );
}
