import React, { useState, useCallback, useEffect } from 'react';
import { BookOpen, BarChart2, Settings, Lock, Loader2, X, ShieldAlert, Activity, Layers, Sparkles, Compass } from 'lucide-react';
import { cn } from './utils/helpers';
import { Student, Competence, Result, FluenceScore, FluenceReference, CurriculumItem, CurriculumResult, ApcEntry, ParentPriorityEntry } from './types';

import SaisieTab from './components/SaisieTab';
import PilotageTab from './components/PilotageTab';
import AdminTab from './components/AdminTab';
import FluenceTab from './components/fluence/FluenceTab';
import CurriculumTab from './components/curriculum/CurriculumTab';
import ApcTab, { ApcAssignmentDraft } from './components/ApcTab';
import AutonomieTab from './components/AutonomieTab';
import ParentPage from './pages/parent';

export default function App() {
  const [isParentRoute] = useState(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      const params = new URLSearchParams(window.location.search);
      return path.startsWith('/parent') || params.has('auth');
    }
    return false;
  });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loginInput, setLoginInput] = useState('');
  const [loginError, setLoginError] = useState('');

  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [editPasswordInput, setEditPasswordInput] = useState<string>('');
  const [editPasswordError, setEditPasswordError] = useState<string>('');

  const [students, setStudents] = useState<Student[]>([]);
  const [competences, setCompetences] = useState<Competence[]>([]);
  const [results, setResults] = useState<Record<string, Record<number, Result>>>({});
  const [fluenceScores, setFluenceScores] = useState<FluenceScore[]>([]);
  const [fluenceReferences, setFluenceReferences] = useState<FluenceReference[]>([]);
  const [curriculumItems, setCurriculumItems] = useState<CurriculumItem[]>([]);
  const [curriculumResults, setCurriculumResults] = useState<CurriculumResult[]>([]);
  const [apcEntries, setApcEntries] = useState<ApcEntry[]>([]);
  const [parentPriorities, setParentPriorities] = useState<ParentPriorityEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'saisie' | 'pilotage' | 'curriculum' | 'fluence' | 'autonomie' | 'apc' | 'admin'>('saisie');

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
          setFluenceScores(data.fluenceScores || []);
          setFluenceReferences(data.fluenceReferences || []);
          setCurriculumItems(data.curriculumItems || []);
          setCurriculumResults(data.curriculumResults || []);
          setApcEntries(data.apcEntries || []);
          setParentPriorities(data.parentPriorities || []);
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
    if (isAuthenticated && !isParentRoute) {
      fetchData();
    }
  }, [isAuthenticated, isParentRoute, fetchData]);

  const handleSaveFluenceScore = useCallback(async (score: FluenceScore) => {
    setFluenceScores(prev => {
      const filtered = prev.filter(s => !(
        (s.studentId === score.studentId || (s as any).studentid === score.studentId) &&
        Number(s.period) === Number(score.period)
      ));
      const rawScore = score.score;
      const isNullOrEmpty = rawScore === null || rawScore === undefined || (rawScore as any) === '';
      if (!isNullOrEmpty && !isNaN(Number(rawScore))) {
        return [...filtered, score];
      }
      return filtered;
    });

    try {
      await fetch('/api/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'fluence_upsert',
          ...score
        })
      });
    } catch (err) {
      console.error('Erreur sauvegarde score fluence:', err);
    }
  }, []);

  const handleSaveBulkFluenceScores = useCallback(async (scores: FluenceScore[]) => {
    setFluenceScores(prev => {
      let next = [...prev];
      scores.forEach(score => {
        next = next.filter(s => !(
          (s.studentId === score.studentId || (s as any).studentid === score.studentId) &&
          Number(s.period) === Number(score.period)
        ));
        const rawScore = score.score;
        const isNullOrEmpty = rawScore === null || rawScore === undefined || (rawScore as any) === '';
        if (!isNullOrEmpty && !isNaN(Number(rawScore))) {
          next.push(score);
        }
      });
      return next;
    });

    try {
      await fetch('/api/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'fluence_bulk_upsert',
          data: scores
        })
      });
    } catch (err) {
      console.error('Erreur sauvegarde bulk fluence:', err);
    }
  }, []);

  const handleSaveFluenceReferences = useCallback(async (refs: FluenceReference[]) => {
    setFluenceReferences(refs);

    try {
      await fetch('/api/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'fluence_reference_bulk_upsert',
          data: refs
        })
      });
    } catch (err) {
      console.error('Erreur sauvegarde seuils fluence:', err);
    }
  }, []);

  // --- HANDLERS CURRICULUM ---
  const handleSaveCurriculumResult = useCallback(async (result: {
    studentId: string;
    curriculumId: number;
    evaluationNum: number;
    score: number | null;
    grade: string;
  }) => {
    // Mise à jour optimiste du state local
    setCurriculumResults(prev => {
      const filtered = prev.filter(r => !(
        r.studentId === result.studentId &&
        r.curriculumId === result.curriculumId &&
        r.evaluationNum === result.evaluationNum
      ));
      if (result.score !== null && result.score !== undefined && result.score >= 0) {
        return [...filtered, {
          id: `curr_${result.studentId}_C${result.curriculumId}_E${result.evaluationNum}`,
          studentId: result.studentId,
          curriculumId: result.curriculumId,
          evaluationNum: result.evaluationNum,
          score: result.score,
          grade: result.grade
        }];
      }
      return filtered;
    });

    try {
      await fetch('/api/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'curriculum_result_upsert',
          ...result
        })
      });
    } catch (err) {
      console.error('Erreur sauvegarde résultat curriculum:', err);
    }
  }, []);

  const handleSaveCurriculumItem = useCallback(async (item: Partial<CurriculumItem>) => {
    try {
      await fetch('/api/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'curriculum_item_upsert',
          ...item
        })
      });
      await fetchData();
    } catch (err) {
      console.error('Erreur sauvegarde élément curriculum:', err);
    }
  }, [fetchData]);

  const handleBulkSaveCurriculumItems = useCallback(async (items: Partial<CurriculumItem>[]) => {
    try {
      await fetch('/api/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'curriculum_items_bulk_upsert',
          data: items
        })
      });
      await fetchData();
    } catch (err) {
      console.error('Erreur import bulk curriculum:', err);
    }
  }, [fetchData]);

  const handleDeleteCurriculumItem = useCallback(async (id: number) => {
    try {
      await fetch('/api/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'curriculum_item_delete',
          id
        })
      });
      await fetchData();
    } catch (err) {
      console.error('Erreur suppression compétence curriculum:', err);
    }
  }, [fetchData]);

  const handleClearCurriculumItems = useCallback(async () => {
    try {
      await fetch('/api/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'clear',
          table: 'CurriculumItem'
        })
      });
      await fetchData();
    } catch (err) {
      console.error('Erreur vidage curriculum:', err);
    }
  }, [fetchData]);

  // --- HANDLERS APC ---
  const handleSaveApcSession = useCallback(async (payload: {
    sessionDate: string;
    notes: string;
    entries: Array<ApcAssignmentDraft & { studentId: string }>;
  }) => {
    const res = await fetch('/api/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'apc_session_save',
        ...payload
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Échec de l’enregistrement de la séance APC.');
    }
    const saved: ApcEntry[] = Array.isArray(data.entries) ? data.entries : [];
    const savedSessionId: string = data.sessionId || '';
    setApcEntries(prev => {
      const remaining = savedSessionId ? prev.filter(e => e.session_id !== savedSessionId) : prev;
      return [...saved, ...remaining].sort((a, b) => b.session_date.localeCompare(a.session_date));
    });
  }, []);

  const handleDeleteApcSession = useCallback(async (sessionId: string) => {
    const res = await fetch('/api/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'apc_session_delete',
        sessionId
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Échec de la suppression de la séance APC.');
    }
    setApcEntries(prev => prev.filter(e => e.session_id !== sessionId));
  }, []);

  const handleToggleApcAuthorization = useCallback(async (studentId: string, apcAuthorized: boolean) => {
    setStudents(prev =>
      prev.map(s => (s.id === studentId ? { ...s, apc_authorized: apcAuthorized } : s))
    );
    try {
      const res = await fetch('/api/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'student_apc_authorization',
          studentId,
          apcAuthorized
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Échec de mise à jour de l’autorisation APC.');
      }
    } catch (err) {
      setStudents(prev =>
        prev.map(s => (s.id === studentId ? { ...s, apc_authorized: !apcAuthorized } : s))
      );
      throw err;
    }
  }, []);

  const handleSaveParentPriorities = useCallback(async (studentId: string, competenceIds: number[]) => {
    const res = await fetch('/api/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'parent_priority_save',
        studentId,
        competenceIds
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Échec de la sauvegarde des priorités parents.');
    }
    const saved: ParentPriorityEntry[] = Array.isArray(data.entries) ? data.entries : [];
    setParentPriorities(prev => [
      ...saved,
      ...prev.filter(p => p.student_id !== studentId)
    ]);
  }, []);

  const upsertResult = useCallback(async (
    studentId: string,
    competenceId: number,
    updates: Partial<Pick<Result, 'score' | 'isStarted'>>
  ) => {
    setResults((prev) => {
      const next = { ...prev };
      if (!next[studentId]) next[studentId] = {};
      const current = next[studentId][competenceId] || { studentId, competenceId, score: null, isStarted: false };
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
          score: updates.score === undefined ? null : updates.score,
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
            const current = next[s.id][comp.id] || { studentId: s.id, competenceId: comp.id, score: null, isStarted: false };
            next[s.id] = { ...next[s.id], [comp.id]: { ...current, isStarted } };
         });
       });
       return next;
     });

     try {
        await fetch('/api/upsert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'result_bulk_start',
            competenceIds: matchingComps.map(c => parseInt(c.id as any, 10)),
            studentIds: students.map(s => String(s.id)),
            isStarted
          })
        });
     } catch (e) {
        console.error('Erreur switch compétences', e);
     }
  }, [students]);

  const setCompetencesToNE = useCallback(async (competenceIds: number[]) => {
     if (competenceIds.length === 0) return;

     setResults((prev) => {
       const next = { ...prev };
       students.forEach(s => {
         if (!next[s.id]) next[s.id] = {};
         const studentMap = { ...next[s.id] };
         competenceIds.forEach(compId => {
           studentMap[compId] = {
             studentId: s.id,
             competenceId: compId,
             score: null,
             isStarted: true
           };
         });
         next[s.id] = studentMap;
       });
       return next;
     });

     try {
       await fetch('/api/upsert', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           type: 'result_bulk_ne',
           competenceIds: competenceIds.map(id => parseInt(id as any, 10)),
           studentIds: students.map(s => String(s.id))
         })
       });
     } catch (e) {
       console.error('Erreur passage à NE en masse', e);
     }
  }, [students]);

  const fetchObservations = useCallback(async (studentId: string) => {
     try {
       const resPost = await fetch('/api/upsert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get_observation', type: 'observation_fetch', studentId }) 
       });
       if (resPost.ok) {
         const data = await resPost.json();
         return data.content || data.observation || '';
       }
     } catch(e) { console.error('fetchObservations error:', e); }
     return '';
  }, []);

  const saveObservation = useCallback(async (studentId: string, content: string) => {
     try {
        const res = await fetch('/api/upsert', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
              type: 'observation',
              studentId,
              content
           })
        });
        if (!res.ok) throw new Error('Failed to save');
     } catch (e) {
        console.error(e);
        throw e;
     }
  }, []);

  const handleToggleEditMode = () => {
    if (isEditMode) {
      setIsEditMode(false);
    } else {
      setEditPasswordInput('');
      setEditPasswordError('');
      setShowEditModal(true);
    }
  };

  const [isVerifyingLogin, setIsVerifyingLogin] = useState<boolean>(false);

  const handleUnlockEditMode = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditPasswordError('');
    if (!editPasswordInput.trim()) {
      setEditPasswordError('Veuillez saisir un mot de passe.');
      return;
    }

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: editPasswordInput.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsEditMode(true);
        setShowEditModal(false);
        setEditPasswordInput('');
        setEditPasswordError('');
      } else {
        setEditPasswordError(data.message || 'Mot de passe incorrect.');
      }
    } catch (err: any) {
      setEditPasswordError('Erreur lors de la vérification du mot de passe.');
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (!loginInput.trim()) {
      setLoginError('Veuillez entrer un mot de passe.');
      return;
    }

    setIsVerifyingLogin(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: loginInput.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsAuthenticated(true);
        setLoginError('');
      } else {
        setLoginError(data.message || 'Mot de passe incorrect.');
      }
    } catch (err: any) {
      setLoginError('Erreur de connexion au serveur.');
    } finally {
      setIsVerifyingLogin(false);
    }
  };

  if (isParentRoute) {
    return <ParentPage />;
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 font-sans p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-sm border border-slate-200">
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
              <Lock className="w-6 h-6 text-indigo-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">Accès sécurisé</h2>
            <p className="text-sm text-slate-500 text-center mt-2">Veuillez entrer le mot de passe pour accéder à l'application.</p>
          </div>
          <form 
            onSubmit={handleLoginSubmit}
            className="space-y-4"
          >
            {loginError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 text-rose-500" />
                {loginError}
              </div>
            )}
            <div>
              <input
                type="password"
                value={loginInput}
                onChange={(e) => {
                  setLoginInput(e.target.value);
                  setLoginError('');
                }}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition text-sm"
                placeholder="Mot de passe"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={isVerifyingLogin}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg shadow transition flex items-center justify-center gap-2 text-sm"
            >
              {isVerifyingLogin ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Vérification...
                </>
              ) : (
                'Déverrouiller'
              )}
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

  const activeStudents = students.filter(s => !s.isArchived);
  const uniqueGrades = Array.from(new Set(students.map(s => s.grade)));

  return (
    <div translate="no" className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900">
      <header className="bg-indigo-700 text-white shadow-md z-50 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-3 shrink-0">
            <BookOpen className="w-6 h-6 text-indigo-200" />
            <h1 className="text-lg xl:text-xl font-bold tracking-tight whitespace-nowrap">Suivi Elèves - Julie Carnis-Bréart</h1>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto">
            <button onClick={() => setActiveTab('saisie')} className={cn("px-3 py-2 rounded-md font-medium text-sm transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0", activeTab === 'saisie' ? 'bg-indigo-600 shadow-inner text-white' : 'text-indigo-100 hover:bg-indigo-600/50')}>
              <BookOpen className="w-4 h-4" /> Saisie des réussites
            </button>
            <button onClick={() => setActiveTab('curriculum')} className={cn("px-3 py-2 rounded-md font-medium text-sm transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0", activeTab === 'curriculum' ? 'bg-indigo-600 shadow-inner text-white' : 'text-indigo-100 hover:bg-indigo-600/50')}>
              <Layers className="w-4 h-4" /> Curriculum
            </button>
            <button onClick={() => setActiveTab('fluence')} className={cn("px-3 py-2 rounded-md font-medium text-sm transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0", activeTab === 'fluence' ? 'bg-indigo-600 shadow-inner text-white' : 'text-indigo-100 hover:bg-indigo-600/50')}>
              <Activity className="w-4 h-4" /> Fluence
            </button>
            <button onClick={() => setActiveTab('pilotage')} className={cn("px-3 py-2 rounded-md font-medium text-sm transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0", activeTab === 'pilotage' ? 'bg-indigo-600 shadow-inner text-white' : 'text-indigo-100 hover:bg-indigo-600/50')}>
              <BarChart2 className="w-4 h-4" /> Pilotage
            </button>
            <button onClick={() => setActiveTab('autonomie')} className={cn("px-3 py-2 rounded-md font-medium text-sm transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0", activeTab === 'autonomie' ? 'bg-indigo-600 shadow-inner text-white' : 'text-indigo-100 hover:bg-indigo-600/50')}>
              <Compass className="w-4 h-4" /> Autonomie
            </button>
            <button onClick={() => setActiveTab('apc')} className={cn("px-3 py-2 rounded-md font-medium text-sm transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0", activeTab === 'apc' ? 'bg-indigo-600 shadow-inner text-white' : 'text-indigo-100 hover:bg-indigo-600/50')}>
              <Sparkles className="w-4 h-4" /> APC
            </button>
            <button onClick={() => setActiveTab('admin')} className={cn("px-3 py-2 rounded-md font-medium text-sm transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0", activeTab === 'admin' ? 'bg-indigo-600 shadow-inner text-white' : 'text-indigo-100 hover:bg-indigo-600/50')}>
              <Settings className="w-4 h-4" /> Admin
            </button>
          </div>
        </div>
      </header>

      {activeTab === 'saisie' && (
        <SaisieTab
          students={students}
          competences={competences}
          results={results}
          isEditMode={isEditMode}
          handleToggleEditMode={handleToggleEditMode}
          toggleArchiveStudent={toggleArchiveStudent}
          startCompetencesForCode={startCompetencesForCode}
          setCompetencesToNE={setCompetencesToNE}
          upsertResult={upsertResult}
        />
      )}

      {activeTab === 'pilotage' && (
        <PilotageTab
          students={students}
          activeStudents={activeStudents}
          competences={competences}
          results={results}
          fetchObservations={fetchObservations}
          saveObservation={saveObservation}
          uniqueGrades={uniqueGrades}
          fluenceScores={fluenceScores}
          fluenceReferences={fluenceReferences}
          curriculumItems={curriculumItems}
          curriculumResults={curriculumResults}
          parentPriorities={parentPriorities}
          saveParentPriorities={handleSaveParentPriorities}
        />
      )}

      {activeTab === 'autonomie' && (
        <AutonomieTab
          activeStudents={activeStudents}
          competences={competences}
          results={results}
          uniqueGrades={uniqueGrades}
          curriculumItems={curriculumItems}
          curriculumResults={curriculumResults}
          isEditMode={isEditMode}
          handleToggleEditMode={handleToggleEditMode}
          upsertResult={upsertResult}
        />
      )}

      {activeTab === 'apc' && (
        <ApcTab
          students={students}
          activeStudents={activeStudents}
          competences={competences}
          results={results}
          uniqueGrades={uniqueGrades}
          fluenceScores={fluenceScores}
          fluenceReferences={fluenceReferences}
          curriculumItems={curriculumItems}
          curriculumResults={curriculumResults}
          apcEntries={apcEntries}
          isEditMode={isEditMode}
          handleToggleEditMode={handleToggleEditMode}
          onSaveApcSession={handleSaveApcSession}
          onDeleteApcSession={handleDeleteApcSession}
          onToggleApcAuthorization={handleToggleApcAuthorization}
        />
      )}

      {activeTab === 'curriculum' && (
        <CurriculumTab
          students={students}
          curriculumItems={curriculumItems}
          curriculumResults={curriculumResults}
          isEditMode={isEditMode}
          handleToggleEditMode={handleToggleEditMode}
          onSaveCurriculumResult={handleSaveCurriculumResult}
          onSaveCurriculumItem={handleSaveCurriculumItem}
          onBulkSaveCurriculumItems={handleBulkSaveCurriculumItems}
          onDeleteCurriculumItem={handleDeleteCurriculumItem}
          onClearCurriculumItems={handleClearCurriculumItems}
        />
      )}

      {activeTab === 'fluence' && (
        <FluenceTab
          students={students}
          fluenceScores={fluenceScores}
          fluenceReferences={fluenceReferences}
          isEditMode={isEditMode}
          handleToggleEditMode={handleToggleEditMode}
          onSaveFluenceScore={handleSaveFluenceScore}
          onSaveBulkFluenceScores={handleSaveBulkFluenceScores}
          onSaveFluenceReferences={handleSaveFluenceReferences}
        />
      )}

      {activeTab === 'admin' && (
        <AdminTab
          students={students}
          competences={competences}
          fetchData={fetchData}
        />
      )}

      {/* Modale Déverrouillage Mode Saisie */}
      {showEditModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="p-5 bg-indigo-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-indigo-200" />
                <h3 className="font-bold text-base">Activer le mode Saisie</h3>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-indigo-200 hover:text-white transition p-1 rounded-lg hover:bg-indigo-600/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUnlockEditMode} className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Saisissez le mot de passe enregistré dans la table <code className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-xs font-mono">user_settings</code> pour déverrouiller l'édition.
              </p>

              {editPasswordError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-rose-500" />
                  {editPasswordError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mot de passe (user_settings)
                </label>
                <input
                  type="password"
                  value={editPasswordInput}
                  onChange={(e) => {
                    setEditPasswordInput(e.target.value);
                    setEditPasswordError('');
                  }}
                  placeholder="Saisissez le mot de passe..."
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow transition"
                >
                  Déverrouiller
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
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
