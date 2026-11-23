import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  RefreshCw,
  Copy,
  Check,
  ArrowUpRight,
  Users,
  X,
  Sparkles
} from 'lucide-react';
import {
  Student,
  Competence,
  Result,
  FluenceScore,
  FluenceReference,
  CurriculumItem,
  CurriculumResult
} from '../types';
import {
  BilanStyle,
  generateStudentBilan,
  getEvaluatedCompetenceMap
} from '../utils/bilanGenerator';

interface BilanGeneratorPanelProps {
  currentStudent: Student | undefined;
  cohortStudents: Student[];
  activeStudents: Student[];
  competences: Competence[];
  results: Record<string, Record<number, Result>>;
  fluenceScores: FluenceScore[];
  fluenceReferences: FluenceReference[];
  curriculumItems: CurriculumItem[];
  curriculumResults: CurriculumResult[];
  selectedGradeLabel: string;
  onApplyToObservation: (text: string) => void;
}

export default function BilanGeneratorPanel({
  currentStudent,
  cohortStudents,
  activeStudents,
  competences,
  results,
  fluenceScores,
  fluenceReferences,
  curriculumItems,
  curriculumResults,
  selectedGradeLabel,
  onApplyToObservation
}: BilanGeneratorPanelProps) {
  const [style, setStyle] = useState<BilanStyle>('lsu');
  const [includeNumbers, setIncludeNumbers] = useState<boolean>(false);
  const [variant, setVariant] = useState<number>(0);
  const [draftText, setDraftText] = useState<string>('');
  const [copiedSingle, setCopiedSingle] = useState<boolean>(false);
  const [insertedFeedback, setInsertedFeedback] = useState<boolean>(false);

  // Modale export série pour toute la classe / le niveau
  const [isClassModalOpen, setIsClassModalOpen] = useState<boolean>(false);
  const [copiedStudentId, setCopiedStudentId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState<boolean>(false);

  const evaluatedMap = useMemo(
    () => getEvaluatedCompetenceMap(activeStudents, competences, results),
    [activeStudents, competences, results]
  );

  const currentSummary = useMemo(() => {
    if (!currentStudent) return null;
    return generateStudentBilan(
      currentStudent,
      activeStudents,
      competences,
      results,
      fluenceScores,
      fluenceReferences,
      curriculumItems,
      curriculumResults,
      { style, includeNumbers, variant },
      evaluatedMap
    );
  }, [
    currentStudent,
    activeStudents,
    competences,
    results,
    fluenceScores,
    fluenceReferences,
    curriculumItems,
    curriculumResults,
    style,
    includeNumbers,
    variant,
    evaluatedMap
  ]);

  useEffect(() => {
    setDraftText(currentSummary ? currentSummary.text : '');
  }, [currentSummary]);

  const classBilans = useMemo(() => {
    if (!isClassModalOpen) return [];
    return cohortStudents.map((st, idx) =>
      generateStudentBilan(
        st,
        activeStudents,
        competences,
        results,
        fluenceScores,
        fluenceReferences,
        curriculumItems,
        curriculumResults,
        { style, includeNumbers, variant: (variant + idx) % 3 },
        evaluatedMap
      )
    );
  }, [
    isClassModalOpen,
    cohortStudents,
    activeStudents,
    competences,
    results,
    fluenceScores,
    fluenceReferences,
    curriculumItems,
    curriculumResults,
    style,
    includeNumbers,
    variant,
    evaluatedMap
  ]);

  const handleCopySingle = () => {
    if (!draftText.trim()) return;
    navigator.clipboard?.writeText(draftText);
    setCopiedSingle(true);
    setTimeout(() => setCopiedSingle(false), 2000);
  };

  const handleInsertObservation = () => {
    if (!draftText.trim()) return;
    onApplyToObservation(draftText);
    setInsertedFeedback(true);
    setTimeout(() => setInsertedFeedback(false), 2500);
  };

  const handleCopyClassItem = (studentId: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedStudentId(studentId);
    setTimeout(() => setCopiedStudentId(null), 1800);
  };

  const handleCopyAllClass = () => {
    const allLines = classBilans.map(
      b => `${b.student.firstName} ${b.student.lastName.toUpperCase()} (${b.student.grade}) :\n${b.text}`
    );
    navigator.clipboard?.writeText(allLines.join('\n\n'));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  if (!currentStudent) return null;

  return (
    <>
      <div className="p-6 bg-slate-50 border-b border-slate-200">
        <div className="bg-white rounded-xl border border-indigo-200/80 shadow-xs p-5 space-y-4">
          {/* En-tête et contrôles */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                <FileText className="w-5 h-5 text-indigo-600" />
                Assistant de Bilan Pré-rédigé (Sans IA)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Texte assemblé automatiquement à partir des chapitres évalués (moy. classe &gt; 0), de la fluence et du curriculum.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setStyle('lsu')}
                  className={`px-3 py-1.5 rounded-md font-bold transition ${
                    style === 'lsu'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Format LSU
                </button>
                <button
                  type="button"
                  onClick={() => setStyle('parents')}
                  className={`px-3 py-1.5 rounded-md font-bold transition ${
                    style === 'parents'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  RDV Parents
                </button>
              </div>

              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 transition">
                <input
                  type="checkbox"
                  checked={includeNumbers}
                  onChange={e => setIncludeNumbers(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Chiffres</span>
              </label>

              <button
                type="button"
                onClick={() => setVariant(prev => (prev + 1) % 3)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition"
                title="Changer la tournure des phrases"
              >
                <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
                Varier ({variant + 1}/3)
              </button>

              <button
                type="button"
                onClick={() => setIsClassModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-xs font-bold text-indigo-700 transition"
              >
                <Users className="w-3.5 h-3.5" />
                Export Série ({cohortStudents.length})
              </button>
            </div>
          </div>

          {/* Repères factuels détectés */}
          {currentSummary && (
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md">
                {currentSummary.evaluatedCount} chapitre(s) évalué(s)
              </span>
              {currentSummary.rawAvg5 !== null && (
                <span className="font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-md">
                  Atteinte obj. 5 : {currentSummary.targetPct} % (Moy. {currentSummary.rawAvg5}/5 vs classe {currentSummary.cohortAvg5}/5)
                </span>
              )}
              {currentSummary.strongDomains.length > 0 && (
                <span className="font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                  Points forts : {currentSummary.strongDomains.map(d => d.name).join(', ')}
                </span>
              )}
              {currentSummary.weakDomains.length > 0 && (
                <span className="font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md">
                  À consolider : {currentSummary.weakDomains.map(d => d.name).join(', ')}
                </span>
              )}
              {currentSummary.fluenceLatest && (
                <span className="font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md">
                  Fluence P{currentSummary.fluenceLatest.period} : {currentSummary.fluenceLatest.score} MCLM
                </span>
              )}
            </div>
          )}

          {/* Zone de texte éditable */}
          <textarea
            value={draftText}
            onChange={e => setDraftText(e.target.value)}
            rows={4}
            className="w-full p-3.5 border border-slate-300 rounded-xl text-sm text-slate-800 leading-relaxed focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
            placeholder="Le bilan pré-rédigé apparaîtra ici..."
          />

          {/* Boutons d'action */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11px] text-slate-500">
              Modifiable librement avant copie ou insertion dans vos observations.
            </span>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleInsertObservation}
                disabled={!draftText.trim()}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition disabled:opacity-50"
              >
                {insertedFeedback ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    Inséré dans Observations
                  </>
                ) : (
                  <>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    Insérer dans Observations
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleCopySingle}
                disabled={!draftText.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition disabled:opacity-50"
              >
                {copiedSingle ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedSingle ? 'Copié pour le LSU !' : 'Copier pour le LSU'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modale Export Série Classe */}
      {isClassModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] border border-slate-200 flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-indigo-700 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-indigo-200" />
                <div>
                  <h3 className="font-bold text-base">
                    Export Série des Bilans — {selectedGradeLabel === 'all' ? 'Tous les niveaux' : selectedGradeLabel}
                  </h3>
                  <p className="text-xs text-indigo-200">
                    {classBilans.length} élève(s) • Format : {style === 'lsu' ? 'LSU' : 'RDV Parents'} {includeNumbers ? '(avec chiffres)' : '(qualitatif)'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyAllClass}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-white text-indigo-700 hover:bg-indigo-50 transition"
                >
                  {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedAll ? 'Tout copié !' : 'Tout copier'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsClassModalOpen(false)}
                  className="text-indigo-200 hover:text-white p-1.5 rounded-lg hover:bg-indigo-600/50 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-slate-50">
              {classBilans.map(bilan => (
                <div
                  key={bilan.student.id}
                  className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-800">
                        {bilan.student.lastName.toUpperCase()} {bilan.student.firstName}
                      </span>
                      <span className="text-[11px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                        {bilan.student.grade}
                      </span>
                      {bilan.rawAvg5 !== null && (
                        <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                          {bilan.targetPct} % (Moy. {bilan.rawAvg5}/5)
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopyClassItem(bilan.student.id, bilan.text)}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition"
                    >
                      {copiedStudentId === bilan.student.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          Copié
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copier
                        </>
                      )}
                    </button>
                  </div>

                  <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                    {bilan.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
