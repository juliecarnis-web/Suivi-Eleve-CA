import React, { useState, useEffect } from 'react';
import { ShieldAlert, Upload, PlusCircle, Trash2, Database, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import Papa from 'papaparse';
import { Student, Competence } from '../types';
import { getGrade } from '../utils/helpers';

interface AdminTabProps {
  students: Student[];
  competences: Competence[];
  fetchData: () => Promise<void>;
}

export default function AdminTab({ students, competences, fetchData }: AdminTabProps) {
  const [statusMsg, setStatusMsg] = useState('');
  const [dbTesting, setDbTesting] = useState(false);
  const [dbStatus, setDbStatus] = useState<{
    tested: boolean;
    connected: boolean;
    message: string;
    timestamp?: string;
    version?: string;
    error?: string;
  }>({
    tested: false,
    connected: false,
    message: ''
  });

  const checkDbConnection = async () => {
    setDbTesting(true);
    try {
      const res = await fetch('/api/db-status');
      const data = await res.json();
      setDbStatus({
        tested: true,
        connected: data.connected,
        message: data.message,
        timestamp: data.timestamp,
        version: data.version,
        error: data.error
      });
    } catch (err: any) {
      setDbStatus({
        tested: true,
        connected: false,
        message: 'Impossible d\'interroger le serveur backend.',
        error: err.message
      });
    } finally {
      setDbTesting(false);
    }
  };

  useEffect(() => {
    checkDbConnection();
  }, []);

  const [pendingClearTable, setPendingClearTable] = useState<string | null>(null);
  const [confirmFinalResult, setConfirmFinalResult] = useState<boolean>(false);
  const [isClearing, setIsClearing] = useState<boolean>(false);

  const clearMessages: Record<string, string> = {
    Student: 'Vider la table des élèves supprimera tous les élèves.',
    Competence: 'Vider la progression supprimera toutes les compétences.',
    Result: 'Vider la table des notes supprimera tous les résultats.',
    Observations: 'Vider la table des observations supprimera toutes les observations.',
    APC: 'Vider la table APC supprimera tout l’historique des séances APC enregistrées.',
    ParentPriority: 'Vider les recommandations parents supprimera les chapitres prioritaires affichés dans le portail famille.'
  };

  const requestClearTable = (tableName: string) => {
    setPendingClearTable(tableName);
    setConfirmFinalResult(false);
  };

  const executeClearTable = async (tableName: string) => {
    if (tableName === 'Result' && !confirmFinalResult) {
      setConfirmFinalResult(true);
      return;
    }

    setIsClearing(true);
    try {
      const res = await fetch('/api/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear', table: tableName })
      });
      if (res.ok) {
        const labels: Record<string, string> = {
          Student: 'Élèves',
          Competence: 'Progression',
          Result: 'Notes',
          Observations: 'Observations',
          APC: 'APC',
          ParentPriority: 'Recommandations parents'
        };
        setStatusMsg(`✅ Table « ${labels[tableName] || tableName} » vidée !`);
        setPendingClearTable(null);
        setConfirmFinalResult(false);
        await fetchData();
      } else {
        setStatusMsg("❌ Erreur lors du vidage.");
      }
    } catch (err) {
      console.error(err);
      setStatusMsg("❌ Erreur lors du vidage.");
    } finally {
      setIsClearing(false);
    }
  };

  const handleAddStudent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const body = {
      type: 'student',
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

  const allDBGrades = Array.from(new Set([
    ...students.map(s => s.grade),
    ...competences.map(c => getGrade(c) || '')
  ].filter(Boolean))).sort();

  return (
    <div className="flex-1 p-6 overflow-auto bg-slate-100">
      <div className="max-w-3xl mx-auto space-y-6">
        
        {statusMsg && (
          <div className="bg-indigo-50 border border-indigo-200 text-indigo-800 px-4 py-3 rounded-lg shadow-sm font-medium flex items-center gap-3">
            <ShieldAlert className="w-5 h-5" />
            {statusMsg}
          </div>
        )}

        {/* Diagnostic Connexion Neon PostgreSQL */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-600" /> État de la connexion Neon PostgreSQL
            </h2>
            <button
              onClick={checkDbConnection}
              disabled={dbTesting}
              className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md hover:bg-indigo-100 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${dbTesting ? 'animate-spin' : ''}`} />
              Tester la connexion
            </button>
          </div>
          <div className="p-6">
            {dbStatus.tested ? (
              dbStatus.connected ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-emerald-900 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-emerald-800">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    {dbStatus.message}
                  </div>
                  {dbStatus.timestamp && (
                    <p className="text-xs font-mono text-emerald-700">Horodatage serveur : {new Date(dbStatus.timestamp).toLocaleString('fr-FR')}</p>
                  )}
                  {dbStatus.version && (
                    <p className="text-xs font-mono text-emerald-600 truncate" title={dbStatus.version}>Base : {dbStatus.version}</p>
                  )}
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-900 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-amber-800">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    {dbStatus.message}
                  </div>
                  {dbStatus.error && (
                    <p className="text-xs font-mono bg-white p-2 rounded border border-amber-200 text-rose-700">{dbStatus.error}</p>
                  )}
                  <p className="text-xs text-amber-800 font-medium pt-1">
                    Pour vous connecter, renseignez la variable <code className="bg-amber-100 px-1 py-0.5 rounded font-mono font-bold">DATABASE_URL</code> dans le panneau <strong>Settings / Secrets</strong> de Google AI Studio.
                  </p>
                </div>
              )
            ) : (
              <div className="text-xs text-slate-500 italic">Vérification de la connexion en cours...</div>
            )}
          </div>
        </div>
        
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

            {pendingClearTable && (
              <div className="mx-6 mt-5 p-4 rounded-xl bg-rose-50 border border-rose-300 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-rose-900">
                    {pendingClearTable === 'Result' && confirmFinalResult
                      ? 'Confirmation finale : cette suppression de toutes les notes est irréversible.'
                      : clearMessages[pendingClearTable] || `Voulez-vous vraiment vider la table ${pendingClearTable} ?`}
                  </p>
                  <p className="text-xs text-rose-700">
                    Action définitive en base de données (idéale pour la remise à zéro de fin d’année).
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isClearing}
                    onClick={() => executeClearTable(pendingClearTable)}
                    className="px-3.5 py-2 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white transition"
                  >
                    {isClearing
                      ? 'Vidage...'
                      : pendingClearTable === 'Result' && !confirmFinalResult
                        ? 'Continuer (1/2)'
                        : 'Confirmer le vidage'}
                  </button>
                  <button
                    type="button"
                    disabled={isClearing}
                    onClick={() => {
                      setPendingClearTable(null);
                      setConfirmFinalResult(false);
                    }}
                    className="px-3 py-2 rounded-lg text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}

            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <button type="button" onClick={() => requestClearTable('Student')} className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-4 py-3 rounded-xl transition-all font-bold text-xs uppercase tracking-widest flex items-center justify-center h-14 text-center">
                Vider Élèves
              </button>
              <button type="button" onClick={() => requestClearTable('Competence')} className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-4 py-3 rounded-xl transition-all font-bold text-xs uppercase tracking-widest flex items-center justify-center h-14 text-center">
                Vider Progression
              </button>
              <button type="button" onClick={() => requestClearTable('Result')} className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-4 py-3 rounded-xl transition-all font-bold text-xs uppercase tracking-widest flex items-center justify-center h-14 text-center">
                Vider Notes
              </button>
              <button type="button" onClick={() => requestClearTable('Observations')} className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-4 py-3 rounded-xl transition-all font-bold text-xs uppercase tracking-widest flex items-center justify-center h-14 text-center">
                Vider Observations
              </button>
              <button type="button" onClick={() => requestClearTable('APC')} className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-4 py-3 rounded-xl transition-all font-bold text-xs uppercase tracking-widest flex items-center justify-center h-14 text-center">
                Vider APC
              </button>
              <button type="button" onClick={() => requestClearTable('ParentPriority')} className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-4 py-3 rounded-xl transition-all font-bold text-xs uppercase tracking-widest flex items-center justify-center h-14 text-center">
                Vider recommandations parents
              </button>
            </div>
        </div>
      </div>
    </div>
  );
}
