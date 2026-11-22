import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Users,
  CheckSquare,
  Square,
  Shuffle,
  Monitor,
  Eye,
  EyeOff,
  ArrowLeftRight,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  SlidersHorizontal,
  Sparkles
} from 'lucide-react';
import { Student, FluenceScore, FluenceReference } from '../../types';

interface FluencePairsModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  fluenceScores: FluenceScore[];
  fluenceReferences: FluenceReference[];
  selectedPeriod: number;
  selectedGrade: string;
}

type PairingMode = 'homogeneous' | 'heterogeneous';
type OddHandling = 'trinom' | 'solo';

interface ResolvedStudent {
  student: Student;
  score: number | null;
  scorePeriod: number | null; // null si aucun score connu
  isFallback: boolean;
  targetScore: number;
}

interface StudentGroup {
  id: string;
  members: ResolvedStudent[];
}

export default function FluencePairsModal({
  isOpen,
  onClose,
  students,
  fluenceScores,
  fluenceReferences,
  selectedPeriod,
  selectedGrade
}: FluencePairsModalProps) {
  const filteredStudents = useMemo(
    () =>
      students
        .filter(s => !s.isArchived && (selectedGrade === 'all' || s.grade === selectedGrade))
        .sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr') || a.firstName.localeCompare(b.firstName, 'fr')),
    [students, selectedGrade]
  );

  // Élèves présents cochés (toute la classe cochée par défaut)
  const [presentIds, setPresentIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<PairingMode>('heterogeneous');
  const [oddHandling, setOddHandling] = useState<OddHandling>('trinom');
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [hasGenerated, setHasGenerated] = useState<boolean>(false);

  // Échange manuel : { groupIndex, memberIndex }
  const [swapSelection, setSwapSelection] = useState<{ groupIdx: number; memberIdx: number } | null>(null);

  // Affichage TNI & visibilité des scores (masqué par défaut en mode TNI)
  const [isTniMode, setIsTniMode] = useState<boolean>(false);
  const [showScoresInTni, setShowScoresInTni] = useState<boolean>(false);
  const [showScoresInPrep, setShowScoresInPrep] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  // Synchroniser les présents à l'ouverture ou changement de filtre
  useEffect(() => {
    if (isOpen) {
      setPresentIds(new Set(filteredStudents.map(s => s.id)));
      setGroups([]);
      setHasGenerated(false);
      setSwapSelection(null);
      setIsTniMode(false);
      setShowScoresInTni(false);
    }
  }, [isOpen, selectedGrade, selectedPeriod, filteredStudents.length]);

  // Résolution du score pour chaque élève : priorité à selectedPeriod, sinon dernier score connu
  const resolvedStudentsMap = useMemo(() => {
    const map = new Map<string, ResolvedStudent>();

    filteredStudents.forEach(student => {
      const studentScores = fluenceScores
        .filter(sc => {
          const sid = sc.studentId || (sc as any).studentid;
          const raw = sc.score;
          return (
            sid === student.id &&
            raw !== null &&
            raw !== undefined &&
            String(raw) !== '' &&
            !isNaN(Number(raw))
          );
        })
        .map(sc => ({
          period: Number(sc.period),
          score: Number(sc.score)
        }));

      const currentScore = studentScores.find(s => s.period === Number(selectedPeriod));

      let resolvedScore: number | null = null;
      let resolvedPeriod: number | null = null;
      let isFallback = false;

      if (currentScore) {
        resolvedScore = currentScore.score;
        resolvedPeriod = currentScore.period;
      } else if (studentScores.length > 0) {
        // Règle : on prend le dernier score connu (période <= selectedPeriod la plus récente, sinon la plus récente disponible)
        const priorScores = studentScores
          .filter(s => s.period < Number(selectedPeriod))
          .sort((a, b) => b.period - a.period);

        const chosen =
          priorScores.length > 0
            ? priorScores[0]
            : [...studentScores].sort((a, b) => b.period - a.period)[0];

        resolvedScore = chosen.score;
        resolvedPeriod = chosen.period;
        isFallback = true;
      }

      const ref = fluenceReferences.find(
        r => r.grade === student.grade && Number(r.period) === Number(selectedPeriod)
      );
      const targetScore = ref ? Number(ref.target_score) : 50;

      map.set(student.id, {
        student,
        score: resolvedScore,
        scorePeriod: resolvedPeriod,
        isFallback,
        targetScore
      });
    });

    return map;
  }, [filteredStudents, fluenceScores, fluenceReferences, selectedPeriod]);

  // Seuil conseillé dynamique basé sur la moyenne des cibles des élèves présents
  const recommendedMaxGap = useMemo(() => {
    const presentTargets = filteredStudents
      .filter(s => presentIds.has(s.id))
      .map(s => resolvedStudentsMap.get(s.id)?.targetScore || 50);

    const avgTarget =
      presentTargets.length > 0
        ? presentTargets.reduce((acc, v) => acc + v, 0) / presentTargets.length
        : 50;

    // Homogène : ~18% de la cible (min 8 MCLM) | Hétérogène : ~38% de la cible (min 15 MCLM)
    return mode === 'homogeneous'
      ? Math.max(8, Math.round(avgTarget * 0.18))
      : Math.max(15, Math.round(avgTarget * 0.38));
  }, [filteredStudents, presentIds, resolvedStudentsMap, mode]);

  const [customMaxGap, setCustomMaxGap] = useState<number>(recommendedMaxGap);

  useEffect(() => {
    setCustomMaxGap(recommendedMaxGap);
  }, [recommendedMaxGap, mode]);

  if (!isOpen) return null;

  const toggleStudentPresence = (id: string) => {
    setPresentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllClass = () => {
    setPresentIds(new Set(filteredStudents.map(s => s.id)));
  };

  const deselectAllClass = () => {
    setPresentIds(new Set());
  };

  const generatePairs = () => {
    const presentList = filteredStudents
      .filter(s => presentIds.has(s.id))
      .map(s => resolvedStudentsMap.get(s.id)!)
      .filter(Boolean);

    if (presentList.length === 0) {
      setGroups([]);
      setHasGenerated(true);
      return;
    }

    // Séparer les élèves ayant un score connu de ceux sans aucun score
    const scored = presentList
      .filter(item => item.score !== null)
      .sort((a, b) => (b.score as number) - (a.score as number));
    const unscored = presentList.filter(item => item.score === null);

    const orderedPool = [...scored, ...unscored];
    const nextGroups: StudentGroup[] = [];

    if (orderedPool.length === 1) {
      nextGroups.push({ id: 'group-1', members: [orderedPool[0]] });
    } else if (mode === 'homogeneous') {
      // Homogène : paires adjacentes dans la liste triée
      for (let i = 0; i < orderedPool.length; i += 2) {
        if (i + 1 < orderedPool.length) {
          nextGroups.push({
            id: `group-${nextGroups.length + 1}`,
            members: [orderedPool[i], orderedPool[i + 1]]
          });
        } else {
          // Effectif impair
          if (oddHandling === 'trinom' && nextGroups.length > 0) {
            nextGroups[nextGroups.length - 1].members.push(orderedPool[i]);
          } else {
            nextGroups.push({
              id: `group-${nextGroups.length + 1}`,
              members: [orderedPool[i]]
            });
          }
        }
      }
    } else {
      // Hétérogène maîtrisé : coupe en 2 moitiés (les plus rapides avec la seconde moitié)
      // On travaille sur les élèves scorés d'abord pour garantir l'équilibre tutorat
      const n = orderedPool.length;
      const half = Math.floor(n / 2);
      const topHalf = orderedPool.slice(0, half);
      const bottomHalf = orderedPool.slice(half, half * 2);
      const leftover = n % 2 === 1 ? orderedPool[n - 1] : null;

      for (let i = 0; i < half; i++) {
        nextGroups.push({
          id: `group-${i + 1}`,
          members: [topHalf[i], bottomHalf[i]]
        });
      }

      if (leftover) {
        if (oddHandling === 'trinom' && nextGroups.length > 0) {
          // Placer l'élève restant dans le binôme du milieu pour minimiser les écarts extrêmes
          const targetIdx = Math.floor(nextGroups.length / 2);
          nextGroups[targetIdx].members.push(leftover);
        } else {
          nextGroups.push({
            id: `group-${nextGroups.length + 1}`,
            members: [leftover]
          });
        }
      }
    }

    setGroups(nextGroups);
    setHasGenerated(true);
    setSwapSelection(null);
  };

  const handleMemberClickForSwap = (groupIdx: number, memberIdx: number) => {
    if (!swapSelection) {
      setSwapSelection({ groupIdx, memberIdx });
      return;
    }

    if (swapSelection.groupIdx === groupIdx && swapSelection.memberIdx === memberIdx) {
      setSwapSelection(null);
      return;
    }

    setGroups(prev => {
      const next = prev.map(g => ({ ...g, members: [...g.members] }));
      const first = next[swapSelection.groupIdx].members[swapSelection.memberIdx];
      const second = next[groupIdx].members[memberIdx];
      next[swapSelection.groupIdx].members[swapSelection.memberIdx] = second;
      next[groupIdx].members[memberIdx] = first;
      return next;
    });
    setSwapSelection(null);
  };

  const getGroupMetrics = (group: StudentGroup) => {
    const validScores = group.members.map(m => m.score).filter((s): s is number => s !== null);
    if (validScores.length < 2) {
      return { gap: null, status: 'neutral' as const, label: group.members.length === 1 ? 'Solo / Enseignant' : 'Score manquant' };
    }
    const maxScore = Math.max(...validScores);
    const minScore = Math.min(...validScores);
    const gap = maxScore - minScore;

    const avgTarget =
      group.members.reduce((acc, m) => acc + m.targetScore, 0) / group.members.length;
    const minUsefulGap = Math.max(5, Math.round(avgTarget * 0.1));

    if (mode === 'homogeneous') {
      if (gap <= customMaxGap) {
        return { gap, status: 'optimal' as const, label: 'Écart homogène' };
      }
      return { gap, status: 'warning' as const, label: 'Écart élevé' };
    } else {
      if (gap > customMaxGap) {
        return { gap, status: 'warning' as const, label: 'Écart important' };
      }
      if (gap < minUsefulGap) {
        return { gap, status: 'info' as const, label: 'Niveaux très proches' };
      }
      return { gap, status: 'optimal' as const, label: 'Tutorat équilibré' };
    }
  };

  const handleCopyText = () => {
    const lines = groups.map((g, idx) => {
      const prefix = g.members.length === 3 ? `Trinôme ${idx + 1}` : g.members.length === 1 ? `Solo ${idx + 1}` : `Binôme ${idx + 1}`;
      const names = g.members.map(m => `${m.student.firstName} ${m.student.lastName}`).join(' + ');
      return `${prefix} : ${names}`;
    });
    navigator.clipboard?.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const presentCount = filteredStudents.filter(s => presentIds.has(s.id)).length;
  const fallbackCount = filteredStudents.filter(
    s => presentIds.has(s.id) && resolvedStudentsMap.get(s.id)?.isFallback
  ).length;

  // --- VUE PROJECTION TNI (PLEIN ÉCRAN ÉPURÉ) ---
  if (isTniMode) {
    return (
      <div className="fixed inset-0 bg-slate-900 z-50 flex flex-col overflow-hidden">
        <div className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                Binômes de Lecture — {mode === 'homogeneous' ? 'Groupes de niveau' : 'Tutorat'}
              </h2>
              <p className="text-xs text-slate-300">
                {selectedGrade === 'all' ? 'Toute la classe' : `Niveau ${selectedGrade}`} • Période {selectedPeriod} • {presentCount} élèves présents
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowScoresInTni(prev => !prev)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition ${
                showScoresInTni
                  ? 'bg-indigo-600 text-white border-indigo-500'
                  : 'bg-slate-700 text-slate-200 border-slate-600 hover:bg-slate-600'
              }`}
            >
              {showScoresInTni ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showScoresInTni ? 'Masquer les scores' : 'Afficher les scores'}
            </button>

            <button
              onClick={() => setIsTniMode(false)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-white text-slate-800 hover:bg-slate-100 transition"
            >
              <X className="w-4 h-4" />
              Quitter le mode TNI
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 sm:p-8">
          <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {groups.map((group, idx) => {
              const title =
                group.members.length === 3
                  ? `Trinôme ${idx + 1}`
                  : group.members.length === 1
                  ? `Atelier enseignant`
                  : `Binôme ${idx + 1}`;
              return (
                <div
                  key={group.id}
                  className="bg-white rounded-2xl shadow-lg border-2 border-indigo-100 p-5 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                      <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-3 py-1 rounded-md">
                        {title}
                      </span>
                      {group.members.length === 3 && (
                        <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                          3 élèves
                        </span>
                      )}
                    </div>

                    <div className="space-y-3">
                      {group.members.map(member => (
                        <div
                          key={member.student.id}
                          className="flex items-center justify-between gap-2 bg-slate-50 rounded-xl px-4 py-3 border border-slate-200"
                        >
                          <div>
                            <div className="text-lg font-extrabold text-slate-900 leading-tight">
                              {member.student.firstName}
                            </div>
                            <div className="text-xs font-semibold text-slate-500">
                              {member.student.lastName}
                              {selectedGrade === 'all' ? ` • ${member.student.grade}` : ''}
                            </div>
                          </div>

                          {showScoresInTni && (
                            <div className="text-right shrink-0">
                              <span className="inline-block text-sm font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg">
                                {member.score !== null ? `${member.score} MCLM` : '—'}
                              </span>
                              {member.isFallback && member.scorePeriod && (
                                <div className="text-[10px] font-semibold text-slate-400 mt-0.5">
                                  (P{member.scorePeriod})
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // --- VUE MODALE DE PRÉPARATION ENSEIGNANT ---
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] border border-slate-200 flex flex-col overflow-hidden">
        {/* En-tête */}
        <div className="px-6 py-4 bg-indigo-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center border border-indigo-500">
              <Users className="w-5 h-5 text-indigo-100" />
            </div>
            <div>
              <h3 className="font-bold text-base">Générateur de Binômes de Fluence</h3>
              <p className="text-xs text-indigo-200">
                Période {selectedPeriod} • {selectedGrade === 'all' ? 'Tous niveaux' : selectedGrade} • Repli automatique sur le dernier score connu si non évalué en P{selectedPeriod}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-indigo-200 hover:text-white transition p-1.5 rounded-lg hover:bg-indigo-600/50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps en 2 colonnes sur écran large */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-50/60">
          {/* Colonne Gauche : Appel des présents & paramètres */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {/* Carte Paramètres de différenciation */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  1. Mode de différenciation
                </h4>
                <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                  {presentCount} / {filteredStudents.length} présents
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode('homogeneous')}
                  className={`p-3 rounded-xl border text-left transition ${
                    mode === 'homogeneous'
                      ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-bold text-slate-800">Homogène</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Niveaux proches (lecture partagée)
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('heterogeneous')}
                  className={`p-3 rounded-xl border text-left transition ${
                    mode === 'heterogeneous'
                      ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-bold text-slate-800">Hétérogène</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Tutorat maîtrisé (demi-glissement)
                  </div>
                </button>
              </div>

              {/* Curseur seuil d'écart */}
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
                    Seuil d'écart conseillé
                  </span>
                  <span className="font-bold text-indigo-700">{customMaxGap} MCLM</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={80}
                  step={1}
                  value={customMaxGap}
                  onChange={e => setCustomMaxGap(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Suggéré pour ce groupe : {recommendedMaxGap} MCLM</span>
                  {customMaxGap !== recommendedMaxGap && (
                    <button
                      type="button"
                      onClick={() => setCustomMaxGap(recommendedMaxGap)}
                      className="text-indigo-600 font-semibold hover:underline"
                    >
                      Réinitialiser
                    </button>
                  )}
                </div>
              </div>

              {/* Gestion effectif impair */}
              <div className="flex items-center justify-between gap-2 text-xs pt-1">
                <span className="font-semibold text-slate-600">Si effectif impair :</span>
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setOddHandling('trinom')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition ${
                      oddHandling === 'trinom'
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    1 trinôme
                  </button>
                  <button
                    type="button"
                    onClick={() => setOddHandling('solo')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition ${
                      oddHandling === 'solo'
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    1 élève seul
                  </button>
                </div>
              </div>
            </div>

            {/* Carte Appel des présents */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col flex-1 min-h-[260px]">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-100">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  2. Élèves présents
                </h4>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllClass}
                    className="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-md border border-indigo-200 transition"
                  >
                    Toute la classe
                  </button>
                  <button
                    type="button"
                    onClick={deselectAllClass}
                    className="text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-md border border-slate-200 transition"
                  >
                    Aucun
                  </button>
                </div>
              </div>

              {fallbackCount > 0 && (
                <div className="mb-2.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-medium text-amber-800">
                  {fallbackCount} élève(s) sans score en P{selectedPeriod} utilisent leur dernier score connu.
                </div>
              )}

              <div className="overflow-y-auto max-h-64 divide-y divide-slate-100 pr-1">
                {filteredStudents.map(student => {
                  const isChecked = presentIds.has(student.id);
                  const resolved = resolvedStudentsMap.get(student.id);

                  return (
                    <label
                      key={student.id}
                      className={`flex items-center justify-between py-2 px-2 rounded-lg cursor-pointer transition ${
                        isChecked ? 'hover:bg-indigo-50/50' : 'opacity-55 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleStudentPresence(student.id)}
                          className="sr-only"
                        />
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span className="text-sm font-semibold text-slate-800 truncate">
                          {student.lastName} {student.firstName}
                        </span>
                        {selectedGrade === 'all' && (
                          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                            {student.grade}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {resolved?.score !== null && resolved?.score !== undefined ? (
                          <>
                            <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                              {resolved.score} MCLM
                            </span>
                            {resolved.isFallback && resolved.scorePeriod && (
                              <span
                                title={`Dernier score connu en Période ${resolved.scorePeriod}`}
                                className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded"
                              >
                                P{resolved.scorePeriod}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-[11px] font-medium text-slate-400 italic">
                            Non évalué
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={generatePairs}
                disabled={presentCount === 0}
                className="mt-4 w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-sm font-bold shadow transition flex items-center justify-center gap-2"
              >
                <Shuffle className="w-4 h-4" />
                {mode === 'homogeneous'
                  ? 'Générer les binômes homogènes'
                  : 'Générer les binômes hétérogènes'}
              </button>
            </div>
          </div>

          {/* Colonne Droite : Résultat des binômes */}
          <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col min-h-[400px]">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
              <div>
                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  3. Binômes proposés ({groups.length})
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cliquez sur deux élèves différents pour les échanger manuellement entre deux binômes.
                </p>
              </div>

              {hasGenerated && groups.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowScoresInPrep(prev => !prev)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 transition"
                  >
                    {showScoresInPrep ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showScoresInPrep ? 'Masquer scores' : 'Afficher scores'}
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyText}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 transition"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copié' : 'Copier'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowScoresInTni(false); // Masqué par défaut en affichage TNI
                      setIsTniMode(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white rounded-lg shadow-sm transition"
                  >
                    <Monitor className="w-3.5 h-3.5" />
                    Affichage TNI
                  </button>
                </div>
              )}
            </div>

            {!hasGenerated ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-6 text-slate-400">
                <Users className="w-12 h-12 text-slate-300 mb-3" />
                <p className="text-sm font-semibold text-slate-600">
                  Cochez les élèves présents puis lancez la génération
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-md">
                  Le générateur forme des paires homogènes ou hétérogènes à partir des scores MCLM de la période {selectedPeriod} (ou du dernier score connu).
                </p>
              </div>
            ) : groups.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-500 py-12">
                Aucun élève présent sélectionné.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 overflow-y-auto pr-1">
                {groups.map((group, groupIdx) => {
                  const metrics = getGroupMetrics(group);
                  const groupLabel =
                    group.members.length === 3
                      ? `Trinôme ${groupIdx + 1}`
                      : group.members.length === 1
                      ? `Solo ${groupIdx + 1}`
                      : `Binôme ${groupIdx + 1}`;

                  return (
                    <div
                      key={group.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 flex flex-col justify-between gap-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-md">
                          {groupLabel}
                        </span>

                        {showScoresInPrep && (
                          <div className="flex items-center gap-1.5">
                            {metrics.gap !== null && (
                              <span className="text-[11px] font-bold text-slate-600">
                                Δ {metrics.gap} MCLM
                              </span>
                            )}
                            {metrics.status === 'optimal' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                                <CheckCircle2 className="w-3 h-3" />
                                {metrics.label}
                              </span>
                            )}
                            {metrics.status === 'warning' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                                <AlertTriangle className="w-3 h-3" />
                                {metrics.label}
                              </span>
                            )}
                            {metrics.status === 'info' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-sky-100 text-sky-800 px-2 py-0.5 rounded">
                                {metrics.label}
                              </span>
                            )}
                            {metrics.status === 'neutral' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
                                {metrics.label}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        {group.members.map((member, memberIdx) => {
                          const isSelected =
                            swapSelection?.groupIdx === groupIdx &&
                            swapSelection?.memberIdx === memberIdx;

                          return (
                            <button
                              key={member.student.id}
                              type="button"
                              onClick={() => handleMemberClickForSwap(groupIdx, memberIdx)}
                              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left transition ${
                                isSelected
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                  : 'bg-white text-slate-800 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <ArrowLeftRight
                                  className={`w-3.5 h-3.5 shrink-0 ${
                                    isSelected ? 'text-indigo-200' : 'text-slate-400'
                                  }`}
                                />
                                <span className="text-xs font-bold truncate">
                                  {member.student.firstName} {member.student.lastName}
                                </span>
                                {selectedGrade === 'all' && (
                                  <span
                                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                                      isSelected
                                        ? 'bg-indigo-500 text-white'
                                        : 'bg-slate-100 text-slate-500'
                                    }`}
                                  >
                                    {member.student.grade}
                                  </span>
                                )}
                              </div>

                              {showScoresInPrep && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <span
                                    className={`text-xs font-bold ${
                                      isSelected ? 'text-white' : 'text-indigo-700'
                                    }`}
                                  >
                                    {member.score !== null ? `${member.score}` : '—'}
                                  </span>
                                  {member.isFallback && member.scorePeriod && (
                                    <span
                                      className={`text-[10px] font-bold px-1 rounded ${
                                        isSelected
                                          ? 'bg-indigo-500 text-white'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      P{member.scorePeriod}
                                    </span>
                                  )}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
