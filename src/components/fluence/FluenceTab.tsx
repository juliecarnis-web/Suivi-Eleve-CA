import React, { useState } from 'react';
import { Student, FluenceScore, FluenceReference } from '../../types';
import FluenceStatsHeader from './FluenceStatsHeader';
import FluenceCharts from './FluenceCharts';
import FluenceSaisieGrid from './FluenceSaisieGrid';
import FluenceSettingsModal from './FluenceSettingsModal';
import FluencePairsModal from './FluencePairsModal';
import { Sliders, BookOpen, Lock, Unlock, Users } from 'lucide-react';

interface FluenceTabProps {
  students: Student[];
  fluenceScores: FluenceScore[];
  fluenceReferences: FluenceReference[];
  isEditMode: boolean;
  handleToggleEditMode?: () => void;
  onSaveFluenceScore: (score: FluenceScore) => Promise<void>;
  onSaveBulkFluenceScores: (scores: FluenceScore[]) => Promise<void>;
  onSaveFluenceReferences: (refs: FluenceReference[]) => Promise<void>;
}

export default function FluenceTab({
  students,
  fluenceScores,
  fluenceReferences,
  isEditMode,
  handleToggleEditMode,
  onSaveFluenceScore,
  onSaveBulkFluenceScores,
  onSaveFluenceReferences
}: FluenceTabProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<number>(1);
  const [selectedGrade, setSelectedGrade] = useState<string>('all');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isPairsModalOpen, setIsPairsModalOpen] = useState<boolean>(false);

  // Liste des niveaux uniques d'élèves non archivés
  const availableGrades = Array.from(new Set(students.filter(s => !s.isArchived).map(s => s.grade))).sort();

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Barre d'outils et sélecteurs de période / niveau */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Cahier de Fluence & Lecture</h1>
            <p className="text-xs text-slate-500">
              Suivi de la vitesse de lecture (mots correctement lus par minute) et positionnement par période.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Bouton Activer Saisie */}
          {handleToggleEditMode && (
            <button
              onClick={handleToggleEditMode}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition border shadow-sm ${
                isEditMode
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                  : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
              }`}
            >
              {isEditMode ? <Unlock className="w-4 h-4 text-emerald-600" /> : <Lock className="w-4 h-4 text-amber-600" />}
              {isEditMode ? 'Mode Saisie: Actif' : 'Activer Saisie'}
            </button>
          )}

          {/* Sélecteur de Niveau */}
          <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold">
            <span className="text-slate-500">Niveau :</span>
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer"
            >
              <option value="all">Tous les niveaux</option>
              {availableGrades.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* Sélecteur de Période (P1 - P5) */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
            {[1, 2, 3, 4, 5].map(p => (
              <button
                key={p}
                onClick={() => setSelectedPeriod(p)}
                className={`px-3 py-1 text-xs font-bold rounded-md transition ${
                  selectedPeriod === p
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                P{p}
              </button>
            ))}
          </div>

          {/* Bouton de génération des binômes */}
          <button
            onClick={() => setIsPairsModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg border border-indigo-200 transition ml-auto md:ml-0"
          >
            <Users className="w-4 h-4 text-indigo-600" />
            Binômes
          </button>

          {/* Bouton de configuration des seuils */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 transition"
          >
            <Sliders className="w-4 h-4 text-slate-500" />
            Seuils
          </button>
        </div>
      </div>

      {/* Cartouche d'en-tête (Statistiques clés) */}
      <FluenceStatsHeader
        students={students}
        fluenceScores={fluenceScores}
        fluenceReferences={fluenceReferences}
        selectedPeriod={selectedPeriod}
        selectedGrade={selectedGrade}
      />

      {/* Cartouche des Graphiques (Profil Élève & Vue Classe) */}
      <FluenceCharts
        students={students}
        fluenceScores={fluenceScores}
        fluenceReferences={fluenceReferences}
        selectedPeriod={selectedPeriod}
        selectedGrade={selectedGrade}
      />

      {/* Grille de Saisie Rapide */}
      <FluenceSaisieGrid
        students={students}
        fluenceScores={fluenceScores}
        fluenceReferences={fluenceReferences}
        selectedPeriod={selectedPeriod}
        selectedGrade={selectedGrade}
        isEditMode={isEditMode}
        handleToggleEditMode={handleToggleEditMode}
        onSaveScore={onSaveFluenceScore}
        onSaveBulkScores={onSaveBulkFluenceScores}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Modale de gestion des seuils */}
      <FluenceSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        fluenceReferences={fluenceReferences}
        onSaveReferences={onSaveFluenceReferences}
      />

      {/* Modale de génération des binômes de travail */}
      <FluencePairsModal
        isOpen={isPairsModalOpen}
        onClose={() => setIsPairsModalOpen(false)}
        students={students}
        fluenceScores={fluenceScores}
        fluenceReferences={fluenceReferences}
        selectedPeriod={selectedPeriod}
        selectedGrade={selectedGrade}
      />
    </div>
  );
}
