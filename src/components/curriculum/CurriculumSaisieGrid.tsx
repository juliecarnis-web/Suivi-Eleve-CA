import React, { useState } from 'react';
import { Student, CurriculumItem, CurriculumResult } from '../../types';
import { Search, Plus, Minus, Layers, Sparkles } from 'lucide-react';

interface CurriculumSaisieGridProps {
  students: Student[];
  curriculumItems: CurriculumItem[];
  curriculumResults: CurriculumResult[];
  selectedGrade: string;
  setSelectedGrade: (grade: string) => void;
  isEditMode: boolean;
  onSaveResult: (result: {
    studentId: string;
    curriculumId: number;
    evaluationNum: number;
    score: number | null;
    grade: string;
  }) => Promise<void>;
  onOpenSettings?: () => void;
}

export default function CurriculumSaisieGrid({
  students,
  curriculumItems,
  curriculumResults,
  selectedGrade,
  setSelectedGrade,
  isEditMode,
  onSaveResult,
  onOpenSettings
}: CurriculumSaisieGridProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubDomain, setSelectedSubDomain] = useState<string>('all');

  // Filtrer les élèves non archivés et correspondant au niveau sélectionné
  const filteredStudents = students.filter(s => {
    if (s.isArchived) return false;
    if (selectedGrade !== 'all' && s.grade !== selectedGrade) return false;
    return true;
  });

  // Trier les élèves par ordre alphabétique du Nom de famille (lastName)
  const sortedStudents = [...filteredStudents].sort((a, b) => {
    const cmp = (a.lastName || '').localeCompare(b.lastName || '', 'fr', { sensitivity: 'base' });
    if (cmp !== 0) return cmp;
    return (a.firstName || '').localeCompare(b.firstName || '', 'fr', { sensitivity: 'base' });
  });

  // Niveaux disponibles
  const availableGrades = Array.from(new Set(students.filter(s => !s.isArchived).map(s => s.grade))).sort();

  // Compétences du niveau sélectionné et filtrées par sous-domaine / recherche
  const filteredItems = curriculumItems.filter(item => {
    if (selectedGrade !== 'all' && item.grade !== selectedGrade) return false;
    if (selectedSubDomain !== 'all' && (item.subDomain || 'Sans sous-domaine') !== selectedSubDomain) return false;
    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      const matchCode = item.code?.toLowerCase().includes(term);
      const matchTitle = item.title?.toLowerCase().includes(term);
      const matchDomain = item.domain?.toLowerCase().includes(term);
      const matchSub = item.subDomain?.toLowerCase().includes(term);
      if (!matchCode && !matchTitle && !matchDomain && !matchSub) return false;
    }
    return true;
  });

  // Regroupement des compétences par sous-domaine et tri par code
  const groupedItemsMap = new Map<string, CurriculumItem[]>();
  filteredItems.forEach(item => {
    const sub = item.subDomain || 'Sans sous-domaine';
    if (!groupedItemsMap.has(sub)) {
      groupedItemsMap.set(sub, []);
    }
    groupedItemsMap.get(sub)!.push(item);
  });

  // Tri interne par "code" (ex: CURRI-1, CURRI-2, etc.)
  groupedItemsMap.forEach(items => {
    items.sort((a, b) => (a.code || '').localeCompare(b.code || '', 'fr', { numeric: true, sensitivity: 'base' }));
  });

  // Liste ordonnée des sous-domaines
  const sortedSubDomainGroups = Array.from(groupedItemsMap.entries()).sort(([subA], [subB]) =>
    subA.localeCompare(subB, 'fr', { sensitivity: 'base' })
  );

  // Sous-domaines uniques pour le niveau filtré (pour le menu déroulant de filtre)
  const availableSubDomains = Array.from(
    new Set(
      curriculumItems
        .filter(i => selectedGrade === 'all' || i.grade === selectedGrade)
        .map(i => i.subDomain || 'Sans sous-domaine')
    )
  ).sort();

  // Map d'accès aux résultats : studentId_curriculumId -> score
  const resultMap = new Map<string, number>();
  curriculumResults.forEach(r => {
    resultMap.set(`${r.studentId}_${r.curriculumId}`, r.score);
  });

  const getScore = (studentId: string, curriculumId: number): number => {
    return resultMap.get(`${studentId}_${curriculumId}`) ?? 0;
  };

  const handleScoreChange = async (studentId: string, curriculumItem: CurriculumItem, newScore: number) => {
    const clampedScore = Math.max(0, Math.min(3, newScore));
    await onSaveResult({
      studentId,
      curriculumId: curriculumItem.id,
      evaluationNum: 1, // Fixé à 1 car plus de notion de numéro d'évaluation
      score: clampedScore,
      grade: curriculumItem.grade
    });
  };

  const renderScoreControl = (studentId: string, curriculumItem: CurriculumItem) => {
    const score = getScore(studentId, curriculumItem.id);

    // Nuancier de verts selon le score (0 à 3 points)
    // 0 = Gris neutre
    // 1 = Vert très clair
    // 2 = Vert moyen
    // 3 = Vert foncé
    let badgeClass = "bg-slate-100 text-slate-400 border-slate-200";
    if (score === 1) {
      badgeClass = "bg-emerald-100 text-emerald-800 border-emerald-300 font-bold";
    } else if (score === 2) {
      badgeClass = "bg-emerald-500 text-white border-emerald-600 font-bold shadow-xs";
    } else if (score === 3) {
      badgeClass = "bg-emerald-800 text-white border-emerald-900 font-extrabold shadow-sm";
    }

    return (
      <div className="flex items-center justify-center gap-1">
        {/* Bouton - */}
        <button
          onClick={() => handleScoreChange(studentId, curriculumItem, score - 1)}
          disabled={!isEditMode || score <= 0}
          className="w-6 h-7 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-30 disabled:hover:bg-slate-100 flex items-center justify-center transition border border-slate-300 font-bold text-xs"
          title="Diminuer (-1 pt)"
        >
          <Minus className="w-3 h-3" />
        </button>

        {/* Badge Score / Affichage */}
        <div
          className={`w-10 h-7 rounded-md flex items-center justify-center text-xs border transition ${badgeClass}`}
        >
          {score} / 3
        </div>

        {/* Bouton + */}
        <button
          onClick={() => handleScoreChange(studentId, curriculumItem, score + 1)}
          disabled={!isEditMode || score >= 3}
          className="w-6 h-7 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 disabled:opacity-30 disabled:hover:bg-indigo-50 flex items-center justify-center transition border border-indigo-200 font-bold text-xs"
          title="Augmenter (+1 pt)"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Barre de filtres et recherche */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Filtre Niveau et Sous-domaine */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Niveau :</span>
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 shadow-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="all">Tous les niveaux</option>
              {availableGrades.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sous-domaine :</span>
            <select
              value={selectedSubDomain}
              onChange={(e) => setSelectedSubDomain(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 shadow-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none max-w-[220px]"
            >
              <option value="all">Tous les sous-domaines</option>
              {availableSubDomains.map(sd => (
                <option key={sd} value={sd}>{sd}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Barre de recherche */}
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Rechercher une compétence..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Légende rapide des points (Nuancier de verts) */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-xs">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-slate-600">Légende des points (0 à 3) :</span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-slate-100 text-slate-500 border border-slate-300 font-bold text-[10px] flex items-center justify-center">0</span>
            <span className="text-slate-700">0 pt : Gris (Non entamé)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-[10px] flex items-center justify-center">1</span>
            <span className="text-slate-700">1 pt : Vert très clair</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-emerald-500 text-white font-bold text-[10px] flex items-center justify-center">2</span>
            <span className="text-slate-700">2 pts : Vert moyen</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-emerald-800 text-white font-bold text-[10px] flex items-center justify-center">3</span>
            <span className="text-slate-700">3 pts : Vert foncé (Objectif Max)</span>
          </span>
        </div>
        {!isEditMode && (
          <span className="text-amber-700 font-medium bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-md">
            🔒 Mode consultation. Cliquez sur "Activer la Saisie" pour modifier les points.
          </span>
        )}
      </div>

      {/* Tableau de saisie */}
      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-3">
          <Layers className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-semibold text-slate-700">Aucune compétence trouvée</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {curriculumItems.length === 0
              ? "Le référentiel de compétences n'a pas encore été importé."
              : "Aucune compétence ne correspond aux filtres de niveau ou de sous-domaine."}
          </p>
          {curriculumItems.length === 0 && onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg transition shadow-xs"
            >
              <Sparkles className="w-4 h-4" />
              Importer les compétences (CSV)
            </button>
          )}
        </div>
      ) : sortedStudents.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500 text-xs">
          Aucun élève trouvé pour le niveau sélectionné.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 sticky top-0 z-30 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 text-xs font-bold text-slate-700 uppercase tracking-wider sticky left-0 bg-slate-100 z-40 border-r border-slate-200 min-w-[280px] max-w-[340px]">
                    Compétence ({filteredItems.length})
                  </th>
                  {sortedStudents.map(student => (
                    <th
                      key={student.id}
                      className="py-3 px-3 text-xs font-semibold text-slate-700 border-r border-slate-200 min-w-[130px] max-w-[160px] text-center hover:bg-slate-100 transition"
                      title={`${student.lastName.toUpperCase()} ${student.firstName} (${student.grade})`}
                    >
                      <div className="flex flex-col items-center justify-center gap-0.5">
                        <span className="font-bold text-xs text-slate-800 truncate max-w-[130px]">
                          {student.lastName.toUpperCase()} {student.firstName}
                        </span>
                        <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100">
                          {student.grade}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedSubDomainGroups.map(([subDomain, items]) => (
                  <React.Fragment key={`subdomain-${subDomain}`}>
                    {/* En-tête de section par sous-domaine */}
                    <tr className="bg-indigo-50/90 border-y border-indigo-200">
                      <td
                        colSpan={1 + sortedStudents.length}
                        className="py-2.5 px-0 bg-indigo-50/90 z-20"
                      >
                        <div className="sticky left-0 inline-flex items-center gap-2 px-4 max-w-full">
                          <Layers className="w-4 h-4 text-indigo-600 shrink-0" />
                          <span className="font-bold text-xs text-indigo-950 uppercase tracking-wider whitespace-nowrap">
                            {subDomain}
                          </span>
                          <span className="text-[10px] font-bold bg-indigo-200/70 text-indigo-800 px-2 py-0.5 rounded-full border border-indigo-300/50 shrink-0 whitespace-nowrap">
                            {items.length} {items.length > 1 ? 'compétences' : 'compétence'}
                          </span>
                        </div>
                      </td>
                    </tr>

                    {/* Liste des compétences du sous-domaine */}
                    {items.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition border-b border-slate-100">
                        {/* Cellule Compétence (Ligne gauche, sticky) */}
                        <td className="py-2.5 px-4 sticky left-0 bg-white hover:bg-slate-50 z-10 border-r border-slate-200 shadow-xs min-w-[280px] max-w-[340px]">
                          <div className="flex items-start gap-2">
                            <span className="font-bold text-indigo-700 text-[11px] bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 shrink-0 mt-0.5">
                              {item.code}
                            </span>
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="text-xs font-semibold text-slate-800 leading-tight">
                                {item.title}
                              </span>
                              <span className="text-[10px] text-slate-400 font-normal">
                                {item.domain} • {item.grade}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Cellules Évaluation pour chaque élève (Colonnes) */}
                        {sortedStudents.map(student => (
                          <td
                            key={student.id}
                            className="py-2 px-2 border-r border-slate-200 text-center min-w-[130px]"
                          >
                            {renderScoreControl(student.id, item)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
