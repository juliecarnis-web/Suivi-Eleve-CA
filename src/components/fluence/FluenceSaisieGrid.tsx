import React, { useState, useEffect } from 'react';
import { Student, FluenceScore, FluenceReference } from '../../types';
import { Save, CheckCircle, AlertCircle, Sparkles, Lock, Unlock } from 'lucide-react';

interface FluenceSaisieGridProps {
  students: Student[];
  fluenceScores: FluenceScore[];
  fluenceReferences: FluenceReference[];
  selectedPeriod: number;
  selectedGrade: string;
  isEditMode: boolean;
  handleToggleEditMode?: () => void;
  onSaveScore: (score: FluenceScore) => Promise<void>;
  onSaveBulkScores: (scores: FluenceScore[]) => Promise<void>;
  onOpenSettings: () => void;
}

export default function FluenceSaisieGrid({
  students,
  fluenceScores,
  fluenceReferences,
  selectedPeriod,
  selectedGrade,
  isEditMode,
  handleToggleEditMode,
  onSaveScore,
  onSaveBulkScores,
  onOpenSettings
}: FluenceSaisieGridProps) {
  const activeStudents = students.filter(s => !s.isArchived && (selectedGrade === 'all' || s.grade === selectedGrade));

  // État local de la grille pour permettre une saisie fluide
  const [gridData, setGridData] = useState<Record<string, { score: string; errors: string; text_title: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [globalSaving, setGlobalSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Synchroniser la grille avec les scores venant du backend
  useEffect(() => {
    const map: Record<string, { score: string; errors: string; text_title: string }> = {};
    activeStudents.forEach(st => {
      const existing = fluenceScores.find(s => (s.studentId === st.id || (s as any).studentid === st.id) && Number(s.period) === Number(selectedPeriod));
      map[st.id] = {
        score: existing?.score !== undefined && existing?.score !== null ? String(existing.score) : '',
        errors: existing?.errors_count !== undefined && existing?.errors_count !== null ? String(existing.errors_count) : '',
        text_title: existing?.text_title || ''
      };
    });
    setGridData(map);
  }, [selectedPeriod, selectedGrade, fluenceScores, students]);

  const handleInputChange = (studentId: string, field: 'score' | 'errors' | 'text_title', val: string) => {
    setGridData(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: val
      }
    }));
  };

  const handleRowBlur = async (studentId: string) => {
    if (!isEditMode) return;
    const row = gridData[studentId];
    if (!row) return;

    setSavingId(studentId);
    try {
      const isScoreEmpty = row.score === '' || row.score === null || row.score === undefined;
      const scoreVal = isScoreEmpty ? null : parseInt(row.score, 10);
      await onSaveScore({
        studentId,
        period: selectedPeriod,
        score: scoreVal as any,
        errors_count: parseInt(row.errors || '0', 10) || 0,
        text_title: row.text_title || ''
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveAll = async () => {
    setGlobalSaving(true);
    try {
      const listToSave: FluenceScore[] = [];
      activeStudents.forEach(st => {
        const row = gridData[st.id];
        if (row) {
          const isScoreEmpty = row.score === '' || row.score === null || row.score === undefined;
          const scoreVal = isScoreEmpty ? null : parseInt(row.score, 10);
          listToSave.push({
            studentId: st.id,
            period: selectedPeriod,
            score: scoreVal as any,
            errors_count: parseInt(row.errors || '0', 10) || 0,
            text_title: row.text_title || ''
          });
        }
      });

      await onSaveBulkScores(listToSave);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setGlobalSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-slate-800 text-sm">
            Grille de Saisie de Fluence — Période {selectedPeriod}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Saisissez le nombre de mots correctement lus en 1 minute (MCLM) pour chaque élève.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onOpenSettings}
            className="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-200 transition"
          >
            Configurer les Seuils
          </button>

          {isEditMode && (
            <button
              onClick={handleSaveAll}
              disabled={globalSaving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {globalSaving ? 'Sauvegarde...' : 'Enregistrer la Grille'}
            </button>
          )}
        </div>
      </div>

      {!isEditMode && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-800 px-4 py-2.5 text-xs font-semibold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Le mode Saisie est actuellement verrouillé pour éviter les modifications accidentelles.</span>
          </div>
          {handleToggleEditMode && (
            <button
              onClick={handleToggleEditMode}
              className="flex items-center gap-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold shadow-sm transition shrink-0"
            >
              <Lock className="w-3.5 h-3.5" />
              Activer Saisie
            </button>
          )}
        </div>
      )}

      {savedSuccess && (
        <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-800 px-4 py-2 text-xs font-semibold flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          Tous les scores de la période {selectedPeriod} ont été enregistrés avec succès !
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-100 text-slate-600 text-xs font-semibold border-b border-slate-200">
              <th className="py-3 px-4">Élève</th>
              <th className="py-3 px-3">Niveau</th>
              <th className="py-3 px-3 text-center">Score MCLM</th>
              <th className="py-3 px-3 text-center">Erreurs</th>
              <th className="py-3 px-4">Texte Évalué</th>
              <th className="py-3 px-4 text-center">Seuil Visé</th>
              <th className="py-3 px-4 text-center">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-sm">
            {activeStudents.map(student => {
              const row = gridData[student.id] || { score: '', errors: '', text_title: '' };
              const refObj = fluenceReferences.find(r => r.grade === student.grade && r.period === selectedPeriod);
              const targetScore = refObj ? refObj.target_score : 50;
              const numericScore = row.score !== '' ? parseInt(row.score, 10) : null;

              let statusBadge = null;
              if (numericScore !== null && !isNaN(numericScore)) {
                if (numericScore >= targetScore) {
                  statusBadge = (
                    <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-bold">
                      <Sparkles className="w-3 h-3 text-emerald-600" /> Acquis
                    </span>
                  );
                } else if (numericScore >= targetScore * 0.75) {
                  statusBadge = (
                    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-xs px-2.5 py-0.5 rounded-full font-bold">
                      En progrès
                    </span>
                  );
                } else {
                  statusBadge = (
                    <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-800 text-xs px-2.5 py-0.5 rounded-full font-bold">
                      À renforcer
                    </span>
                  );
                }
              } else {
                statusBadge = <span className="text-slate-400 text-xs">—</span>;
              }

              return (
                <tr key={student.id} className="hover:bg-slate-50/80 transition">
                  <td className="py-2.5 px-4 font-bold text-slate-800">
                    {student.lastName} {student.firstName}
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-slate-600 text-xs">
                    <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                      {student.grade}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <input
                      type="number"
                      min="0"
                      max="300"
                      disabled={!isEditMode}
                      value={row.score}
                      onChange={(e) => handleInputChange(student.id, 'score', e.target.value)}
                      onBlur={() => handleRowBlur(student.id)}
                      placeholder="MCLM"
                      className={`w-20 px-2.5 py-1 text-center font-bold border rounded-lg text-sm outline-none transition ${
                        isEditMode
                          ? 'border-indigo-300 focus:ring-2 focus:ring-indigo-500 bg-white'
                          : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                    />
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <input
                      type="number"
                      min="0"
                      max="50"
                      disabled={!isEditMode}
                      value={row.errors}
                      onChange={(e) => handleInputChange(student.id, 'errors', e.target.value)}
                      onBlur={() => handleRowBlur(student.id)}
                      placeholder="Erreurs"
                      className={`w-16 px-2 py-1 text-center border rounded-lg text-xs outline-none transition ${
                        isEditMode
                          ? 'border-slate-300 focus:ring-2 focus:ring-indigo-500 bg-white'
                          : 'border-slate-200 bg-slate-50 text-slate-600'
                      }`}
                    />
                  </td>
                  <td className="py-2.5 px-4">
                    <input
                      type="text"
                      disabled={!isEditMode}
                      value={row.text_title}
                      onChange={(e) => handleInputChange(student.id, 'text_title', e.target.value)}
                      onBlur={() => handleRowBlur(student.id)}
                      placeholder="ex: Le Petit Prince p.12"
                      className={`w-full px-3 py-1 border rounded-lg text-xs outline-none transition ${
                        isEditMode
                          ? 'border-slate-300 focus:ring-2 focus:ring-indigo-500 bg-white'
                          : 'border-slate-200 bg-slate-50 text-slate-600'
                      }`}
                    />
                  </td>
                  <td className="py-2.5 px-4 text-center font-semibold text-slate-600 text-xs">
                    {targetScore} MCLM
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    {savingId === student.id ? (
                      <span className="text-xs text-indigo-600 font-semibold animate-pulse">Enregistrement...</span>
                    ) : (
                      statusBadge
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
